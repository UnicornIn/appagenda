import requests
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email import encoders
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm
import smtplib
import ssl
from io import BytesIO
import os
import base64

# -----------------------
# EMAIL (config desde env)
# -----------------------
EMAIL_SENDER = os.getenv("EMAIL_REMITENTE")
EMAIL_PASSWORD = os.getenv("EMAIL_CONTRASENA")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

# URL del logo (logo principal con fondo oscuro)
LOGO_URL = "https://s3.us-east-1.amazonaws.com/rf.images/companies/default/clients/RF+PNG.png"

# URL alternativa del logo si el principal no funciona (logo rosado con letra blanca)
LOGO_ALTERNATIVO = "https://rizosfelicesdata.s3.us-east-2.amazonaws.com/logo+rosado+letra+blanca.png"

async def descargar_imagen(url: str) -> BytesIO:
    """Descarga una imagen desde una URL"""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return BytesIO(response.content)
    except Exception as e:
        print(f"❌ Error descargando imagen {url}: {e}")
        return None

async def descargar_logo() -> BytesIO:
    """Descarga el logo de Rizos Felices"""
    try:
        # Intentar con el logo principal primero
        logo_buffer = await descargar_imagen(LOGO_URL)
        if logo_buffer:
            return logo_buffer
        else:
            # Fallback al logo alternativo
            print("⚠️ Usando logo alternativo...")
            return await descargar_imagen(LOGO_ALTERNATIVO)
    except Exception as e:
        print(f"❌ Error descargando logo: {e}")
        return None

def imagen_a_base64(img_buffer: BytesIO) -> str:
    """Convierte una imagen a base64 para incluir en HTML"""
    try:
        img_buffer.seek(0)
        return base64.b64encode(img_buffer.read()).decode('utf-8')
    except:
        return ""

def crear_estilos():
    """Crea y retorna los estilos personalizados"""
    styles = getSampleStyleSheet()
    
    return {
        'title_style': ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=20,
            alignment=TA_CENTER,
            spaceAfter=12,
            spaceBefore=10,
            textColor=colors.HexColor('#1A5276'),
            fontName='Helvetica-Bold'
        ),
        
        'section_style': ParagraphStyle(
            'SectionStyle',
            parent=styles['Heading2'],
            fontSize=15,
            alignment=TA_LEFT,
            spaceAfter=8,
            spaceBefore=16,
            textColor=colors.HexColor('#2C3E50'),
            fontName='Helvetica-Bold',
            leftIndent=5
        ),
        
        'subsection_style': ParagraphStyle(
            'SubsectionStyle',
            parent=styles['Heading3'],
            fontSize=13,
            alignment=TA_LEFT,
            spaceAfter=5,
            spaceBefore=10,
            textColor=colors.HexColor('#34495E'),
            fontName='Helvetica-Bold'
        ),
        
        'normal_style': ParagraphStyle(
            'NormalStyle',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_JUSTIFY,
            textColor=colors.HexColor('#2C3E50'),
            leading=13,
            wordWrap='LTR'
        ),
        
        'label_style': ParagraphStyle(
            'LabelStyle',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#7F8C8D'),
            fontName='Helvetica-Bold',
            leading=13
        ),
        
        'value_style': ParagraphStyle(
            'ValueStyle',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#2C3E50'),
            leading=13,
            wordWrap='LTR'
        ),
        
        'footer_style': ParagraphStyle(
            'FooterStyle',
            parent=styles['Normal'],
            fontSize=8,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#7F8C8D'),
            leading=10
        )
    }

async def crear_cabecera(story, estilos):
    """Crea la cabecera del documento con el logo"""
    try:
        # Intentar descargar el logo
        logo_buffer = await descargar_logo()
        if logo_buffer:
            # Agregar fondo oscuro al contenedor del logo
            story.append(Paragraph("", ParagraphStyle('Space', spaceBefore=10)))
            
            # Crear tabla con fondo oscuro para el logo
            logo_table_data = [[
                Image(logo_buffer, width=8*cm, height=3*cm, kind='proportional')
            ]]
            logo_table = Table(logo_table_data, colWidths=[14.5*cm])
            logo_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
                ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#1A5276')),  # Fondo oscuro
                ('BOTTOMPADDING', (0, 0), (0, 0), 10),
                ('TOPPADDING', (0, 0), (0, 0), 10),
            ]))
            story.append(logo_table)
        else:
            # Fallback: texto si no hay logo
            story.append(Paragraph("RIZOS FELICES", 
                                  ParagraphStyle('LogoText', 
                                               fontName='Helvetica-Bold',
                                               fontSize=22,
                                               alignment=TA_CENTER,
                                               textColor=colors.HexColor('#E67E22'),
                                               spaceAfter=15,
                                               spaceBefore=20)))
    except Exception as e:
        print(f"⚠️ Error creando cabecera: {e}")
        story.append(Paragraph("RIZOS FELICES", 
                              ParagraphStyle('LogoText', 
                                           fontName='Helvetica-Bold',
                                           fontSize=22,
                                           alignment=TA_CENTER,
                                           textColor=colors.HexColor('#E67E22'),
                                           spaceAfter=15,
                                           spaceBefore=20)))
    
    story.append(Paragraph("COMPROBANTE DE SERVICIO", estilos['title_style']))
    story.append(Spacer(1, 5))
    story.append(Paragraph(f"Fecha de generación: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}", 
                          ParagraphStyle('Date', parent=estilos['footer_style'],
                                       fontSize=9)))
    story.append(Spacer(1, 20))

def crear_tabla_datos(datos, ancho_etiqueta=4.5*cm, color_fondo='#F5F5F5'):
    """Crea una tabla estilizada para mostrar datos"""
    if not datos:
        return None
    
    tabla = Table(datos, colWidths=[ancho_etiqueta, 14.5*cm - ancho_etiqueta])
    tabla.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor(color_fondo)),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#2C3E50')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('WORDWRAP', (0, 0), (-1, -1), True),
    ]))
    return tabla

def crear_seccion_diagnostico(datos_especificos, estilos):
    """Crea la sección de diagnóstico técnico"""
    secciones = []
    
    if not datos_especificos:
        return secciones
    
    # Campos del diagnóstico técnico
    campos_diagnostico = [
        ('plasticidad', 'Plasticidad'),
        ('permeabilidad', 'Permeabilidad'),
        ('porosidad', 'Porosidad'),
        ('exterior_lipidico', 'Exterior Lipídico'),
        ('densidad', 'Densidad'),
        ('oleosidad', 'Oleosidad'),
        ('grosor', 'Grosor'),
        ('textura', 'Textura'),
        ('frecuencia_corte', 'Frecuencia de Corte'),
        ('tecnicas_estilizado', 'Técnicas de Estilizado'),
        ('productos_sugeridos', 'Productos Sugeridos'),
    ]
    
    datos_tabla = []
    for campo_key, campo_label in campos_diagnostico:
        valor = datos_especificos.get(campo_key)
        if valor and str(valor).strip() and str(valor).lower() != 'no especificado':
            datos_tabla.append([f"{campo_label}:", str(valor)])
    
    if datos_tabla:
        secciones.append(Paragraph("DIAGNÓSTICO TÉCNICO", estilos['section_style']))
        secciones.append(Spacer(1, 8))
        secciones.append(crear_tabla_datos(datos_tabla, 5.5*cm, '#E8F6F3'))
        secciones.append(Spacer(1, 15))
    
    return secciones

def crear_seccion_observaciones(ficha_data, estilos):
    """Crea la sección de observaciones y recomendaciones"""
    secciones = []
    
    observaciones_data = []
    
    # Descripción del servicio
    if ficha_data.get('descripcion_servicio'):
        desc = ficha_data.get('descripcion_servicio')
        if len(desc) > 150:
            secciones.append(Paragraph("DESCRIPCIÓN DEL SERVICIO", estilos['subsection_style']))
            secciones.append(Paragraph(desc, estilos['value_style']))
            secciones.append(Spacer(1, 8))
        else:
            observaciones_data.append(["Descripción:", desc])
    
    # Recomendaciones personalizadas
    if ficha_data.get('datos_especificos', {}).get('recomendaciones_personalizadas'):
        obs = ficha_data['datos_especificos']['recomendaciones_personalizadas']
        if len(obs) > 150:
            secciones.append(Paragraph("RECOMENDACIONES PERSONALIZADAS", estilos['subsection_style']))
            secciones.append(Paragraph(obs, estilos['value_style']))
            secciones.append(Spacer(1, 8))
        else:
            observaciones_data.append(["Recomendaciones:", obs])
    
    # Observaciones generales
    if ficha_data.get('datos_especificos', {}).get('observaciones_generales'):
        obs = ficha_data['datos_especificos']['observaciones_generales']
        if len(obs) > 150:
            secciones.append(Paragraph("OBSERVACIONES GENERALES", estilos['subsection_style']))
            secciones.append(Paragraph(obs, estilos['value_style']))
            secciones.append(Spacer(1, 8))
        else:
            observaciones_data.append(["Observaciones:", obs])
    
    # Descripción adicional
    if ficha_data.get('datos_especificos', {}).get('descripcion'):
        desc = ficha_data['datos_especificos']['descripcion']
        if len(desc) > 150:
            secciones.append(Paragraph("DESCRIPCIÓN ADICIONAL", estilos['subsection_style']))
            secciones.append(Paragraph(desc, estilos['value_style']))
            secciones.append(Spacer(1, 8))
        else:
            observaciones_data.append(["Descripción Adicional:", desc])
    
    if observaciones_data:
        secciones.append(Paragraph("OBSERVACIONES Y RECOMENDACIONES", estilos['section_style']))
        secciones.append(Spacer(1, 8))
        secciones.append(crear_tabla_datos(observaciones_data, 4.5*cm, '#FFF8E1'))
        secciones.append(Spacer(1, 15))
    
    # Firma profesional
    if ficha_data.get('datos_especificos', {}).get('firma_profesional'):
        firma_info = [["Firma Profesional:", "✅ FIRMADO"]]
        if ficha_data.get('datos_especificos', {}).get('fecha_firma'):
            fecha = ficha_data['datos_especificos']['fecha_firma']
            try:
                if 'T' in fecha:
                    fecha_obj = datetime.fromisoformat(fecha.replace('Z', '+00:00'))
                    fecha = fecha_obj.strftime('%d/%m/%Y %H:%M')
            except:
                pass
            firma_info.append(["Fecha de Firma:", fecha])
        
        firma_table = crear_tabla_datos(firma_info, 4*cm, '#E8F6F3')
        if firma_table:
            secciones.append(firma_table)
            secciones.append(Spacer(1, 15))
    
    return secciones

async def crear_seccion_fotos(ficha_data, estilos):
    """Crea la sección de fotografías"""
    secciones = []
    
    if not ficha_data.get('fotos'):
        return secciones
    
    fotos = ficha_data['fotos']
    
    # FOTOS ANTES
    if fotos.get('antes') and len(fotos['antes']) > 0:
        secciones.append(Paragraph("FOTOGRAFÍAS - ANTES DEL SERVICIO", estilos['section_style']))
        secciones.append(Spacer(1, 10))
        
        for i, foto_url in enumerate(fotos['antes'][:2]):
            try:
                img_buffer = await descargar_imagen(foto_url)
                if img_buffer:
                    img = Image(img_buffer, width=6*cm, height=6*cm, kind='proportional')
                    img.hAlign = 'CENTER'
                    secciones.append(img)
                    secciones.append(Paragraph(f"Fotografía {i+1} - Antes", 
                                              ParagraphStyle('PhotoLabel', 
                                                           fontSize=9, 
                                                           alignment=TA_CENTER,
                                                           textColor=colors.gray)))
                    secciones.append(Spacer(1, 10))
            except Exception as e:
                print(f"Error procesando imagen antes {i+1}: {e}")
        
        secciones.append(Spacer(1, 15))
    
    # FOTOS DESPUÉS
    if fotos.get('despues') and len(fotos['despues']) > 0:
        secciones.append(Paragraph("FOTOGRAFÍAS - DESPUÉS DEL SERVICIO", estilos['section_style']))
        secciones.append(Spacer(1, 10))
        
        for i, foto_url in enumerate(fotos['despues'][:2]):
            try:
                img_buffer = await descargar_imagen(foto_url)
                if img_buffer:
                    img = Image(img_buffer, width=6*cm, height=6*cm, kind='proportional')
                    img.hAlign = 'CENTER'
                    secciones.append(img)
                    secciones.append(Paragraph(f"Fotografía {i+1} - Después", 
                                              ParagraphStyle('PhotoLabel', 
                                                           fontSize=9, 
                                                           alignment=TA_CENTER,
                                                           textColor=colors.gray)))
                    secciones.append(Spacer(1, 10))
            except Exception as e:
                print(f"Error procesando imagen después {i+1}: {e}")
        
        secciones.append(Spacer(1, 20))
    
    return secciones

async def generar_pdf_ficha(ficha_data: dict, cita_data: dict) -> bytes:
    """Genera un PDF profesional para RIZOS FELICES"""
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, 
                          topMargin=1.5*cm, bottomMargin=1.5*cm,
                          leftMargin=2*cm, rightMargin=2*cm)
    story = []
    
    # =============== ESTILOS CON NEGRO Y GRIS ===============
    styles = getSampleStyleSheet()
    
    # Solo negro y gris
    COLOR_NEGRO = '#000000'      # Negro puro
    COLOR_GRIS_OSCURO = '#333333' # Gris oscuro
    COLOR_GRIS_MEDIO = '#666666'  # Gris medio
    COLOR_GRIS_CLARO = '#999999'  # Gris claro
    
    # Estilo para título principal
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=24,
        alignment=TA_CENTER,
        spaceAfter=5,
        textColor=colors.black,
        fontName='Helvetica-Bold'
    )
    
    # Estilo para subtítulo
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Heading2'],
        fontSize=13,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.HexColor(COLOR_GRIS_OSCURO),
        fontName='Helvetica'
    )
    
    # Estilo para secciones principales
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=16,
        alignment=TA_LEFT,
        spaceAfter=10,
        spaceBefore=20,
        textColor=colors.black,
        fontName='Helvetica-Bold',
        leftIndent=0
    )
    
    # Estilo para subsecciones
    subsection_style = ParagraphStyle(
        'SubsectionStyle',
        parent=styles['Heading3'],
        fontSize=14,
        alignment=TA_LEFT,
        spaceAfter=6,
        spaceBefore=12,
        textColor=colors.HexColor(COLOR_GRIS_OSCURO),
        fontName='Helvetica-Bold'
    )
    
    # Estilo para etiquetas
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_LEFT,
        textColor=colors.HexColor(COLOR_GRIS_OSCURO),
        fontName='Helvetica-Bold',
        leading=16
    )
    
    # Estilo para valores
    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_LEFT,
        textColor=colors.black,
        leading=16,
        wordWrap='LTR'
    )
    
    # Estilo para texto normal
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontSize=11,
        alignment=TA_LEFT,
        textColor=colors.HexColor(COLOR_GRIS_MEDIO),
        leading=15,
        wordWrap='LTR'
    )
    
    # Estilo para footer
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor(COLOR_GRIS_MEDIO),
        leading=14
    )
    
    # =============== CABECERA CON LOGO ===============
    try:
        # Descargar el logo de Rizos Felices
        logo_buffer = await descargar_imagen("https://s3.us-east-1.amazonaws.com/rf.images/companies/default/clients/RF+PNG.png")
        if logo_buffer:
            # Logo centrado
            logo_img = Image(logo_buffer, width=10*cm, height=4*cm, kind='proportional')
            logo_img.hAlign = 'CENTER'
            story.append(logo_img)
            story.append(Spacer(1, 10))
        else:
            # Fallback: texto
            story.append(Paragraph("RIZOS FELICES", title_style))
    except:
        story.append(Paragraph("RIZOS FELICES", title_style))
    
    story.append(Paragraph("Sistema de Gestión Profesional", subtitle_style))
    story.append(Spacer(1, 20))
    
    # =============== 1. INFORMACIÓN DEL CLIENTE ===============
    story.append(Paragraph("INFORMACIÓN DEL CLIENTE", section_style))
    
    # Limpiar nombre del cliente
    cliente_nombre = f"{ficha_data.get('nombre', '')} {ficha_data.get('apellido', '')}".strip()
    if cliente_nombre.endswith(" None"):
        cliente_nombre = cliente_nombre.replace(" None", "")
    
    cliente_email = ficha_data.get('email', 'No especificado') or 'No especificado'
    cliente_telefono = ficha_data.get('telefono', 'No especificado') or 'No especificado'
    
    # Tabla simple
    cliente_data = [
        [Paragraph("<b>Nombre:</b>", label_style), Paragraph(cliente_nombre, value_style)],
        [Paragraph("<b>Email:</b>", label_style), Paragraph(cliente_email, value_style)],
        [Paragraph("<b>Teléfono:</b>", label_style), Paragraph(cliente_telefono, value_style)]
    ]
    
    cliente_table = Table(cliente_data, colWidths=[4.5*cm, 10.5*cm])
    cliente_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    
    story.append(cliente_table)
    story.append(Spacer(1, 20))
    
    # =============== 2. INFORMACIÓN DEL SERVICIO ===============
    story.append(Paragraph("INFORMACIÓN DEL SERVICIO", section_style))
    
    # Formatear fecha (ej: "14 ene 2026")
    fecha_servicio = ficha_data.get('fecha_reserva', 'No especificado')
    if fecha_servicio != 'No especificado':
        try:
            if 'T' in fecha_servicio:
                fecha_obj = datetime.fromisoformat(fecha_servicio.replace('Z', '+00:00'))
                fecha_servicio = fecha_obj.strftime('%d %b %Y').lower()
            else:
                fecha_obj = datetime.strptime(fecha_servicio.split('T')[0], '%Y-%m-%d')
                fecha_servicio = fecha_obj.strftime('%d %b %Y').lower()
        except:
            pass
    
    # Limpiar nombre del profesional
    profesional_nombre = ficha_data.get('profesional_nombre', 'No especificado')
    if profesional_nombre and profesional_nombre.lower() != 'no especificado':
        if 'estilista' in profesional_nombre.lower():
            partes = profesional_nombre.split()
            nombres = [p for p in partes if len(p) > 2 and p[0].isupper() and p.isalpha()]
            if nombres:
                profesional_nombre = ' '.join(nombres)
            else:
                profesional_nombre = 'Profesional'
    
    servicio_data = [
        [Paragraph("<b>Servicio:</b>", label_style), Paragraph(ficha_data.get('servicio_nombre', 'No especificado'), value_style)],
        [Paragraph("<b>Fecha:</b>", label_style), Paragraph(fecha_servicio, value_style)],
        [Paragraph("<b>Sede:</b>", label_style), Paragraph(ficha_data.get('sede_nombre', 'No especificado'), value_style)],
        [Paragraph("<b>Profesional:</b>", label_style), Paragraph(profesional_nombre, value_style)]
    ]
    
    servicio_table = Table(servicio_data, colWidths=[4.5*cm, 10.5*cm])
    servicio_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    
    story.append(servicio_table)
    story.append(Spacer(1, 25))
    
    # =============== 3. NOTAS DEL CLIENTE ===============
    story.append(Paragraph("NOTAS DEL CLIENTE", section_style))
    story.append(Spacer(1, 10))
    
    # =============== 4. DIAGNÓSTICO RIZO TIPO ===============
    # Verificar si hay suficiente espacio
    story.append(Paragraph("DIAGNÓSTICO RIZO TIPO:", subsection_style))
    
    if ficha_data.get('datos_especificos'):
        datos_especificos = ficha_data['datos_especificos']
        
        campos_rizo = [
            ('plasticidad', 'Plasticidad'),
            ('permeabilidad', 'Permeabilidad'),
            ('porosidad', 'Porosidad'),
            ('exterior_lipidico', 'Exterior Lipídico'),
            ('densidad', 'Densidad'),
            ('oleosidad', 'Oleosidad'),
            ('grosor', 'Grosor'),
            ('textura', 'Textura'),
        ]
        
        # Preparar datos para diagnóstico
        rizo_data = []
        
        for campo_key, campo_label in campos_rizo:
            valor = datos_especificos.get(campo_key, '').strip()
            if valor and valor.lower() != 'no especificado':
                if isinstance(valor, str):
                    if valor.upper() in ['ALTA', 'MEDIA', 'BAJA']:
                        valor = valor.upper()
                    else:
                        valor = valor.title()
                
                rizo_data.append([
                    Paragraph(f"<b>{campo_label}:</b>", label_style),
                    Paragraph(valor, value_style)
                ])
        
        if rizo_data:
            rizo_table = Table(rizo_data, colWidths=[5*cm, 10*cm])
            rizo_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            story.append(rizo_table)
            story.append(Spacer(1, 15))
    
    # =============== 5. SECCIONES INDIVIDUALES ===============
    # Lista de secciones en orden
    secciones = [
        ("RECOMENDACIONES PERSONALIZADAS", 
         ficha_data.get('datos_especificos', {}).get('recomendaciones_personalizadas')),
        ("FRECUENCIA DE CORTE", 
         ficha_data.get('datos_especificos', {}).get('frecuencia_corte')),
        ("TÉCNICAS DE ESTILIZADO", 
         ficha_data.get('datos_especificos', {}).get('tecnicas_estilizado')),
        ("PRODUCTOS SUGERIDOS", 
         ficha_data.get('datos_especificos', {}).get('productos_sugeridos')),
        ("OBSERVACIONES GENERALES", 
         ficha_data.get('datos_especificos', {}).get('observaciones_generales')),
    ]
    
    # Agregar secciones
    for titulo, contenido in secciones:
        if contenido and str(contenido).strip() and str(contenido).lower() != 'no especificado':
            story.append(Paragraph(titulo + ":", subsection_style))
            story.append(Paragraph(contenido, normal_style))
            story.append(Spacer(1, 12))
    
    # =============== 6. COMENTARIO INTERNO ===============
    comentario_interno = ficha_data.get('comentario_interno')
    if comentario_interno and str(comentario_interno).strip() and str(comentario_interno).lower() != 'no especificado':
        story.append(Paragraph("COMENTARIO INTERNO", subsection_style))
        story.append(Paragraph(comentario_interno, normal_style))
        story.append(Spacer(1, 20))
    
    # =============== 7. IMÁGENES DEL SERVICIO ===============
    tiene_imagenes = ficha_data.get('fotos', {}).get('antes') or ficha_data.get('fotos', {}).get('despues')
    
    if tiene_imagenes:
        story.append(PageBreak())
        
        # Cabecera de página de imágenes
        try:
            logo_buffer = await descargar_imagen("https://s3.us-east-1.amazonaws.com/rf.images/companies/default/clients/RF+PNG.png")
            if logo_buffer:
                logo_img = Image(logo_buffer, width=8*cm, height=3.2*cm, kind='proportional')
                logo_img.hAlign = 'CENTER'
                story.append(logo_img)
                story.append(Spacer(1, 10))
        except:
            pass
        
        story.append(Paragraph("IMÁGENES DEL SERVICIO", 
                              ParagraphStyle('ImagesTitle',
                                           fontName='Helvetica-Bold',
                                           fontSize=16,
                                           alignment=TA_LEFT,
                                           textColor=colors.black,
                                           spaceAfter=15,
                                           spaceBefore=10)))
        
        # Función para mostrar imágenes
        async def mostrar_imagenes(titulo, urls_imagenes):
            if not urls_imagenes:
                return []
            
            elementos = []
            
            # Título de sección
            elementos.append(Paragraph(titulo, 
                                     ParagraphStyle('ImageSection',
                                                  fontName='Helvetica-Bold',
                                                  fontSize=14,
                                                  alignment=TA_LEFT,
                                                  textColor=colors.HexColor(COLOR_GRIS_OSCURO),
                                                  spaceAfter=10,
                                                  spaceBefore=15)))
            
            # Procesar imágenes en grupos de 2
            for i in range(0, min(len(urls_imagenes), 4), 2):
                fila_urls = urls_imagenes[i:i + 2]
                fila_imagenes = []
                
                for url in fila_urls:
                    try:
                        img_buffer = await descargar_imagen(url)
                        if img_buffer:
                            img = Image(img_buffer, width=8.5*cm, height=8.5*cm, kind='proportional')
                            img.hAlign = 'CENTER'
                            fila_imagenes.append([img])
                        else:
                            fila_imagenes.append([Paragraph("", normal_style)])
                    except:
                        fila_imagenes.append([Paragraph("", normal_style)])
                
                # Asegurar 2 columnas
                while len(fila_imagenes) < 2:
                    fila_imagenes.append([Paragraph("", normal_style)])
                
                # Crear fila de imágenes
                fila_table = Table([fila_imagenes], colWidths=[8.5*cm, 8.5*cm])
                fila_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, 0), 'TOP'),
                    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 15),
                ]))
                
                elementos.append(fila_table)
            
            return elementos
        
        # Mostrar imágenes ANTES
        if ficha_data.get('fotos', {}).get('antes'):
            elementos_antes = await mostrar_imagenes("ANTES:", ficha_data['fotos']['antes'])
            story.extend(elementos_antes)
        
        # Espacio entre secciones de imágenes
        if ficha_data.get('fotos', {}).get('antes') and ficha_data.get('fotos', {}).get('despues'):
            story.append(Spacer(1, 20))
        
        # Mostrar imágenes DESPUÉS
        if ficha_data.get('fotos', {}).get('despues'):
            elementos_despues = await mostrar_imagenes("DESPUÉS:", ficha_data['fotos']['despues'])
            story.extend(elementos_despues)
    
    # =============== 8. FOOTER ===============
    story.append(Spacer(1, 30))
    
    # Formatear fecha en español
    now = datetime.now()
    
    meses_es = {
        'January': 'enero', 'February': 'febrero', 'March': 'marzo',
        'April': 'abril', 'May': 'mayo', 'June': 'junio',
        'July': 'julio', 'August': 'agosto', 'September': 'septiembre',
        'October': 'octubre', 'November': 'noviembre', 'December': 'diciembre'
    }
    
    dias_es = {
        'Monday': 'lunes', 'Tuesday': 'martes', 'Wednesday': 'miércoles',
        'Thursday': 'jueves', 'Friday': 'viernes', 'Saturday': 'sábado',
        'Sunday': 'domingo'
    }
    
    dia_ingles = now.strftime("%A")
    mes_ingles = now.strftime("%B")
    
    dia_espanol = dias_es.get(dia_ingles, dia_ingles.lower())
    mes_espanol = meses_es.get(mes_ingles, mes_ingles.lower())
    
    fecha_formateada = f"{dia_espanol}, {now.day} de {mes_espanol} de {now.year}, {now.strftime('%H:%M')}"
    
    # Footer en negro y gris
    footer_content = f"""
    <para alignment="center">
    <font color="{COLOR_GRIS_MEDIO}" size="10">
    Documento generado el {fecha_formateada}<br/>
    <font color="black"><b>Rizos Felices</b></font> - Sistema de Gestión Profesional<br/>
    <i>Este documento es confidencial y para uso exclusivo del cliente</i>
    </font>
    </para>
    """
    
    story.append(Paragraph(footer_content, footer_style))
    
    # =============== CONSTRUIR PDF ===============
    try:
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
    except Exception as e:
        print(f"❌ Error generando PDF: {e}")
        import traceback
        traceback.print_exc()
        return await generar_pdf_simple_fallback(ficha_data, cita_data)


async def generar_pdf_simple_fallback(ficha_data: dict, cita_data: dict) -> bytes:
    """Versión simple como fallback"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = []
    styles = getSampleStyleSheet()
    
    story.append(Paragraph("RIZOS FELICES", 
                          ParagraphStyle('Title',
                                       parent=styles['Heading1'],
                                       fontSize=20,
                                       alignment=TA_CENTER,
                                       textColor=colors.black)))
    
    story.append(Paragraph("Sistema de Gestión Profesional", 
                          ParagraphStyle('Subtitle',
                                       parent=styles['Normal'],
                                       fontSize=12,
                                       alignment=TA_CENTER,
                                       textColor=colors.gray)))
    
    story.append(Spacer(1, 25))
    
    # Información básica
    info = [
        ["Cliente:", f"{ficha_data.get('nombre', '')}"],
        ["Servicio:", ficha_data.get('servicio_nombre', '')],
        ["Fecha:", datetime.now().strftime('%d/%m/%Y %H:%M')],
        ["Sede:", ficha_data.get('sede_nombre', '')]
    ]
    
    info_table = Table(info, colWidths=[4*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Footer simple
    footer_text = f"Documento generado el {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    story.append(Paragraph(footer_text, 
                          ParagraphStyle('Footer',
                                       parent=styles['Normal'],
                                       fontSize=9,
                                       alignment=TA_CENTER,
                                       textColor=colors.gray)))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

async def generar_pdf_simple_fallback(ficha_data: dict, cita_data: dict) -> bytes:
    """Versión simple como fallback"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = []
    styles = getSampleStyleSheet()
    
    story.append(Paragraph("RIZOS FELICES", 
                          ParagraphStyle('Title',
                                       parent=styles['Heading1'],
                                       fontSize=20,
                                       alignment=TA_CENTER,
                                       textColor=colors.HexColor('#D81B60'))))
    
    story.append(Paragraph("Sistema de Gestión Profesional", 
                          ParagraphStyle('Subtitle',
                                       parent=styles['Normal'],
                                       fontSize=12,
                                       alignment=TA_CENTER,
                                       textColor=colors.HexColor('#8E24AA'))))
    
    story.append(Spacer(1, 25))
    
    # Información básica
    info = [
        ["Cliente:", f"{ficha_data.get('nombre', '')}"],
        ["Servicio:", ficha_data.get('servicio_nombre', '')],
        ["Fecha:", datetime.now().strftime('%d/%m/%Y %H:%M')],
        ["Sede:", ficha_data.get('sede_nombre', '')]
    ]
    
    info_table = Table(info, colWidths=[4*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Footer simple
    footer_text = f"Documento generado el {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    story.append(Paragraph(footer_text, 
                          ParagraphStyle('Footer',
                                       parent=styles['Normal'],
                                       fontSize=9,
                                       alignment=TA_CENTER,
                                       textColor=colors.gray)))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

async def generar_pdf_simple_fallback(ficha_data: dict, cita_data: dict) -> bytes:
    """Versión simple como fallback"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = []
    styles = getSampleStyleSheet()
    
    story.append(Paragraph("RIZOS FELICES", 
                          ParagraphStyle('Title',
                                       parent=styles['Heading1'],
                                       fontSize=20,
                                       alignment=TA_CENTER,
                                       textColor=colors.HexColor('#D81B60'))))
    
    story.append(Paragraph("Sistema de Gestión Profesional", 
                          ParagraphStyle('Subtitle',
                                       parent=styles['Normal'],
                                       fontSize=12,
                                       alignment=TA_CENTER,
                                       textColor=colors.HexColor('#8E24AA'))))
    
    story.append(Spacer(1, 25))
    
    # Información básica
    info = [
        ["Cliente:", f"{ficha_data.get('nombre', '')}"],
        ["Servicio:", ficha_data.get('servicio_nombre', '')],
        ["Fecha:", datetime.now().strftime('%d/%m/%Y %H:%M')],
        ["Sede:", ficha_data.get('sede_nombre', '')]
    ]
    
    info_table = Table(info, colWidths=[4*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Footer simple
    footer_text = f"Documento generado el {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    story.append(Paragraph(footer_text, 
                          ParagraphStyle('Footer',
                                       parent=styles['Normal'],
                                       fontSize=9,
                                       alignment=TA_CENTER,
                                       textColor=colors.gray)))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

async def generar_pdf_simple(ficha_data: dict, cita_data: dict) -> bytes:
    """Genera un PDF simple como fallback"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = []
    styles = getSampleStyleSheet()
    
    story.append(Paragraph("RIZOS FELICES", 
                          ParagraphStyle('Title', parent=styles['Heading1'],
                                       fontSize=18, alignment=TA_CENTER,
                                       textColor=colors.HexColor('#1A5276'))))
    story.append(Paragraph("Comprobante de Servicio", 
                          ParagraphStyle('Subtitle', parent=styles['Heading2'],
                                       fontSize=14, alignment=TA_CENTER)))
    story.append(Spacer(1, 20))
    
    info_content = f"""
    <b>Cliente:</b> {ficha_data.get('nombre', '')}<br/>
    <b>Servicio:</b> {ficha_data.get('servicio_nombre', '')}<br/>
    <b>Profesional:</b> {ficha_data.get('profesional_nombre', '')}<br/>
    <b>Sede:</b> {ficha_data.get('sede_nombre', '')}<br/>
    <b>Fecha:</b> {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}<br/>
    <b>Valor:</b> ${cita_data.get('valor_total', 0):,.0f}
    """
    
    story.append(Paragraph(info_content, styles['Normal']))
    story.append(Spacer(1, 30))
    story.append(Paragraph("Documento generado automáticamente", 
                          ParagraphStyle('Footer', parent=styles['Normal'],
                                       fontSize=9, alignment=TA_CENTER,
                                       textColor=colors.gray)))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

def crear_html_correo_ficha(cliente_nombre: str, servicio_nombre: str, fecha: str) -> str:
    """Crea el HTML para el correo de envío de ficha"""
    current_year = datetime.now().year
    
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comprobante de Servicio - {servicio_nombre}</title>
        <style>
            body {{
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8f9fa;
            }}
            .header {{
                background-color: #1A5276;
                color: white;
                padding: 25px 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }}
            .header h2 {{
                margin: 0;
                font-size: 24px;
                font-weight: bold;
            }}
            .content {{
                padding: 30px;
                background-color: white;
                border: 1px solid #e0e0e0;
                border-top: none;
                border-radius: 0 0 8px 8px;
            }}
            .greeting {{
                font-size: 16px;
                margin-bottom: 20px;
                color: #2C3E50;
            }}
            .info-box {{
                background-color: #EBF5FB;
                border-left: 4px solid #3498DB;
                padding: 20px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .info-box h3 {{
                color: #1A5276;
                margin-top: 0;
                margin-bottom: 15px;
                font-size: 18px;
            }}
            .attachment-notice {{
                background-color: #FEF9E7;
                border: 1px solid #F7DC6F;
                padding: 20px;
                margin: 20px 0;
                border-radius: 5px;
            }}
            .footer {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-size: 12px;
                color: #666;
                text-align: center;
            }}
            .highlight {{
                color: #1A5276;
                font-weight: bold;
            }}
            ul {{
                padding-left: 20px;
                margin: 15px 0;
            }}
            li {{
                margin-bottom: 8px;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h2>✅ Servicio Finalizado</h2>
        </div>
        
        <div class="content">
            <div class="greeting">
                Estimado/a <span class="highlight">{cliente_nombre}</span>,
            </div>
            
            <p>Nos complace informarle que su servicio de <span class="highlight">{servicio_nombre}</span> ha sido finalizado exitosamente.</p>
            
            <div class="info-box">
                <h3>📋 Resumen del Servicio</h3>
                <p><strong>Servicio:</strong> {servicio_nombre}</p>
                <p><strong>Fecha de Finalización:</strong> {fecha}</p>
                <p><strong>Estado:</strong> ✅ COMPLETADO</p>
            </div>
            
            <div class="attachment-notice">
                <h3>📎 Documento Adjunto</h3>
                <p>Se ha adjuntado su <strong>Comprobante de Servicio</strong> en formato PDF que contiene:</p>
                <ul>
                    <li>Información completa del servicio realizado</li>
                    <li>Detalles técnicos y observaciones</li>
                    <li>Fotografías del proceso (si aplica)</li>
                    <li>Información financiera</li>
                    <li>Datos del profesional</li>
                </ul>
            </div>
            
            <p style="text-align: center;">
                <strong>📄 Archivo adjunto:</strong> "comprobante_servicio.pdf"
            </p>
            
            <p><strong>💡 Recomendación:</strong> Guarde este documento para cualquier consulta futura o referencia.</p>
            
            <div style="margin-top: 25px; padding: 15px; background-color: #F8F9F9; border-radius: 5px;">
                <p><strong>📞 Contacto:</strong> Si tiene alguna pregunta sobre su servicio, no dude en contactarnos.</p>
            </div>
            
            <p style="margin-top: 25px;">
                ¡Gracias por confiar en nosotros!<br>
                <strong>El equipo de Rizos Felices</strong>
            </p>
        </div>
        
        <div class="footer">
            <p>Este es un correo automático. Por favor, no responda a este mensaje.</p>
            <p>© {current_year} Rizos Felices - Todos los derechos reservados</p>
        </div>
    </body>
    </html>
    """

async def enviar_correo_con_pdf(
    destinatario: str, 
    asunto: str, 
    mensaje_html: str, 
    pdf_bytes: bytes, 
    nombre_archivo: str = "comprobante_servicio.pdf"
):
    """Envía correo con PDF adjunto"""
    try:
        msg = MIMEMultipart()
        msg["Subject"] = asunto
        msg["From"] = EMAIL_SENDER
        msg["To"] = destinatario
        msg["Date"] = datetime.now().strftime('%a, %d %b %Y %H:%M:%S %z')
        
        # Agregar cuerpo HTML
        msg.attach(MIMEText(mensaje_html, "html", 'utf-8'))
        
        # Adjuntar PDF
        part = MIMEBase("application", "pdf")
        part.set_payload(pdf_bytes)
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{nombre_archivo}"'
        )
        part.add_header("Content-Type", "application/pdf")
        msg.attach(part)
        
        # Enviar correo
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)
        
        print(f"✅ Correo con PDF enviado a {destinatario}")
        return True
        
    except Exception as e:
        print(f"❌ Error enviando email con PDF: {e}")
        return False
    
