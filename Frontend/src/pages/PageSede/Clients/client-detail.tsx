import { useState } from 'react'
import { ArrowLeft, Image as ImageIcon, X, Calendar, MapPin, User, FileText, Tag, ShoppingBag, Scissors, Edit, Download, Droplets, Thermometer, Eye, Zap, ChevronDown, ChevronUp, Activity, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { Button } from "../../../components/ui/button"
import type { Cliente } from "../../../types/cliente"
import { EditClientModal } from "./EditClientModal"
import { API_BASE_URL } from "../../../types/config"
import { formatSedeNombre } from "../../../lib/sede"
import { formatDateDMY } from "../../../lib/dateFormat"

interface ClientDetailProps {
  client: Cliente
  onBack: () => void
  onClientUpdated?: () => void
}

// 🔥 INTERFAZ EXTENDIDA PARA LAS FICHAS - ACTUALIZADA
interface FichaExtendida {
  _id: string;
  cliente_id: string;
  servicio_nombre: string;
  servicio: string;
  profesional_nombre?: string;
  sede_nombre?: string;
  sede?: string;
  local?: string;
  fecha_ficha: string;
  notas_cliente?: string;
  comentario_interno?: string;
  antes_url?: string;
  despues_url?: string;
  fotos?: {
    antes?: string[];
    despues?: string[];
    antes_urls?: string[];
    despues_urls?: string[];
  };
  tipo_ficha?: string;
  datos_especificos?: {
    cita_id?: string;
    plasticidad?: string;
    permeabilidad?: string;
    porosidad?: string;
    exterior_lipidico?: string;
    densidad?: string;
    oleosidad?: string;
    grosor?: string;
    textura?: string;
    recomendaciones_personalizadas?: string;
    frecuencia_corte?: string;
    tecnicas_estilizado?: string;
    productos_sugeridos?: string;
    observaciones_generales?: string;
    autorizacion_publicacion?: boolean;
  };
  respuestas?: Array<{
    pregunta_id: number;
    pregunta: string;
    respuesta: string;
    observaciones?: string;
  }>;
  [key: string]: any;
}

// 🔥 FUNCIÓN PARA ARREGLAR URLs DE IMÁGENES
function fixImageUrl(url: string | undefined): string {
  if (!url) return '';
  
  let fixedUrl = url.replace(/^http:\/\//i, 'https://');
  
  if (fixedUrl.includes('rf.images.s3.us-east-1.amazonaws.com')) {
    if (!fixedUrl.startsWith('https://')) {
      fixedUrl = 'https://' + fixedUrl.replace(/^https?:\/\//, '');
    }
  }
  
  return fixedUrl;
}

// 🔥 FUNCIÓN PARA VALIDAR URL SEGURA
function isSecureUrl(url: string): boolean {
  return url.startsWith('https://');
}

// 🔥 FUNCIÓN PARA OBTENER IMAGEN SEGURA
function getSecureImageUrl(url: string): string {
  if (isSecureUrl(url)) {
    return url;
  }
  
  const fixedUrl = fixImageUrl(url);
  
  if (!isSecureUrl(fixedUrl)) {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjEwMCIgeT0iNzUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzZCNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
  }
  
  return fixedUrl;
}

export function ClientDetail({ client, onBack, onClientUpdated }: ClientDetailProps) {
  const [showImagesModal, setShowImagesModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPDFModal, setShowPDFModal] = useState<{
    show: boolean;
    ficha: FichaExtendida | null;
    fichaId: string | null;
  }>({ show: false, ficha: null, fichaId: null })
  const [selectedImages, setSelectedImages] = useState<{
    antes?: string,
    despues?: string,
    todas_antes?: string[],
    todas_despues?: string[]
  }>({})
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null)
  const [expandedFichas, setExpandedFichas] = useState<Set<string>>(new Set())


  const openImagesModal = (ficha: FichaExtendida) => {
    let antesUrl = ficha.antes_url ? getSecureImageUrl(ficha.antes_url) : '';
    let despuesUrl = ficha.despues_url ? getSecureImageUrl(ficha.despues_url) : '';
    let todasAntes: string[] = [];
    let todasDespues: string[] = [];

    if (ficha.fotos) {
      if (ficha.fotos.antes && Array.isArray(ficha.fotos.antes) && ficha.fotos.antes.length > 0) {
        todasAntes = ficha.fotos.antes.map(url => getSecureImageUrl(url));
        antesUrl = todasAntes[0];
      }
      if (ficha.fotos.despues && Array.isArray(ficha.fotos.despues) && ficha.fotos.despues.length > 0) {
        todasDespues = ficha.fotos.despues.map(url => getSecureImageUrl(url));
        despuesUrl = todasDespues[0];
      }
    }

    setSelectedImages({
      antes: antesUrl,
      despues: despuesUrl,
      todas_antes: todasAntes,
      todas_despues: todasDespues
    });
    setShowImagesModal(true);
  }

  const closeImagesModal = () => {
    setShowImagesModal(false)
    setSelectedImages({})
  }

  const openPDFModal = (ficha: FichaExtendida, fichaId: string) => {
    setShowPDFModal({ show: true, ficha, fichaId });
  }

  const closePDFModal = () => {
    setShowPDFModal({ show: false, ficha: null, fichaId: null });
  }

  const handleEditClick = () => {
    setShowEditModal(true)
  }

  const handleEditSuccess = () => {
    if (onClientUpdated) {
      onClientUpdated()
    }
  }

  // 🔥 FUNCIÓN PARA DESCARGA DE PDF
  const handleDownloadPDF = async (ficha: FichaExtendida, fichaId: string) => {
    try {
      setIsGeneratingPDF(fichaId);

      // 🔍 Obtener ID de cita desde diferentes fuentes posibles
      const citaId = ficha.datos_especificos?.cita_id;
      
      if (!citaId) {
        // Intentar buscar en la lista de citas del cliente
        const citaEnHistorial = client.historialCitas?.find(
          (cita: any) => cita.servicio === (ficha.servicio_nombre || ficha.servicio)
        );
        
        if (citaEnHistorial?.datos_completos?._id) {
          const idCita = citaEnHistorial.datos_completos._id;
          await descargarPDFConCitaId(idCita);
        } else {
          alert('⚠️ No se encontró información de la cita asociada. Contacte al administrador.');
        }
      } else {
        await descargarPDFConCitaId(citaId);
      }

    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('❌ Error al generar el PDF. Por favor, intenta de nuevo.');
    } finally {
      setIsGeneratingPDF(null);
    }
  };

  // Función auxiliar para descargar usando cita_id
  const descargarPDFConCitaId = async (citaId: string) => {
    const token = sessionStorage.getItem('access_token');
    if (!token) throw new Error('Token no encontrado');

    const response = await fetch(
      `${API_BASE_URL}api/pdf/generar-pdf/${client.id}/${citaId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/pdf'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    await descargarArchivo(response);
  };

  // Función genérica para descargar el archivo
  const descargarArchivo = async (response: Response) => {
    const blob = await response.blob();
    
    // Verificar que sea un PDF válido
    if (blob.size === 0 || !blob.type.includes('pdf')) {
      throw new Error('El archivo recibido no es un PDF válido');
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Crear nombre descriptivo
    const timestamp = new Date().toISOString().split('T')[0];
    const nombreCliente = client.nombre.replace(/\s+/g, '_').toLowerCase();
    const servicio = (showPDFModal.ficha?.servicio_nombre || 'servicio')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 30);
    
    link.download = `comprobante_${nombreCliente}_${servicio}_${timestamp}.pdf`;
    
    // Descargar
    document.body.appendChild(link);
    link.click();
    
    // Limpiar
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const formatFechaCorrecida = (fecha: string) => {
    return formatDateDMY(fecha, fecha);
  };

  const toggleFichaExpansion = (fichaId: string) => {
    const newExpanded = new Set(expandedFichas);
    if (newExpanded.has(fichaId)) {
      newExpanded.delete(fichaId);
    } else {
      newExpanded.add(fichaId);
    }
    setExpandedFichas(newExpanded);
  }

  const getDiagnosticoIcon = (valor: string) => {
    switch (valor?.toLowerCase()) {
      case 'muy alta':
      case 'alta':
        return <Activity className="h-3 w-3 text-red-500" />;
      case 'media':
        return <Thermometer className="h-3 w-3 text-yellow-500" />;
      case 'baja':
      case 'muy baja':
        return <Droplets className="h-3 w-3 text-blue-500" />;
      case 'lanoso / ulótrico':
        return <Scissors className="h-3 w-3 text-purple-500" />;
      default:
        return <Info className="h-3 w-3 text-gray-400" />;
    }
  }

  const getDiagnosticoColor = (valor: string) => {
    switch (valor?.toLowerCase()) {
      case 'muy alta':
      case 'alta':
        return 'bg-red-50 text-red-700 border-red-100';
      case 'media':
        return 'bg-yellow-50 text-yellow-700 border-yellow-100';
      case 'baja':
      case 'muy baja':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  }

  const fichasRaw = (client as any)?.fichas
  const fichasCliente: FichaExtendida[] = Array.isArray(fichasRaw)
    ? (fichasRaw as FichaExtendida[])
    : Array.isArray(fichasRaw?.data)
      ? (fichasRaw.data as FichaExtendida[])
      : Array.isArray(fichasRaw?.fichas)
        ? (fichasRaw.fichas as FichaExtendida[])
        : []
  const fichasCargando = fichasRaw === undefined
  const totalFichas = fichasCliente.length

  return (
    <div className="flex h-full flex-col bg-white">
      {/* MODAL DE EDICIÓN DE CLIENTE */}
      <EditClientModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
        cliente={{
          id: client.id,
          nombre: client.nombre,
          correo: client.email !== 'No disponible' ? client.email : '',
          telefono: client.telefono !== 'No disponible' ? client.telefono : '',
          notas: client.nota,
          cedula: '',
          ciudad: '',
          fecha_de_nacimiento: ''
        }}
        token={sessionStorage.getItem('access_token') || ''}
      />

      {/* MODAL DE IMÁGENES */}
      {showImagesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm p-2">
          <div className="relative w-full max-w-xl rounded-lg border border-gray-100 bg-white shadow-sm">
            {/* Header del modal */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-gray-600" />
                <h2 className="text-sm font-medium text-gray-900">Imágenes</h2>
              </div>
              <button
                onClick={closeImagesModal}
                className="p-1 hover:bg-gray-50 rounded"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Imagen ANTES */}
                <div>
                  <h3 className="text-xs font-medium text-gray-600 mb-2">Antes</h3>
                  {selectedImages.antes ? (
                    <div className="overflow-hidden rounded border border-gray-200">
                      <img
                        src={selectedImages.antes}
                        alt="Antes del servicio"
                        className="h-36 w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2QjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIwLjNlbSI+U2luIGltYWdlbjwvdGV4dD48L3N2Zz4=';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded border border-dashed border-gray-200 bg-gray-50">
                      <ImageIcon className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Imagen DESPUÉS */}
                <div>
                  <h3 className="text-xs font-medium text-gray-600 mb-2">Después</h3>
                  {selectedImages.despues ? (
                    <div className="overflow-hidden rounded border border-gray-200">
                      <img
                        src={selectedImages.despues}
                        alt="Después del servicio"
                        className="h-36 w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2QjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIwLjNlbSI+U2luIGltYWdlbjwvdGV4dD48L3N2Zz4=';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded border border-dashed border-gray-200 bg-gray-50">
                      <ImageIcon className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  onClick={closeImagesModal}
                  variant="outline"
                  size="sm"
                  className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cerrar
                </Button>
                {(selectedImages.antes || selectedImages.despues) && (
                  <Button
                    onClick={() => {
                      const imageToDownload = selectedImages.despues || selectedImages.antes
                      if (imageToDownload) {
                        window.open(imageToDownload, '_blank')
                      }
                    }}
                    className="bg-gray-900 hover:bg-gray-800 text-xs text-white"
                    size="sm"
                  >
                    Abrir imagen
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN PARA PDF */}
      {showPDFModal.show && showPDFModal.ficha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-50 p-2">
                <AlertCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Generar Comprobante PDF
                </h3>
                <p className="text-xs text-gray-600 mb-3">
                  Se generará un PDF profesional con todos los detalles del servicio:
                </p>
                <ul className="text-xs text-gray-600 space-y-1 mb-4">
                  <li>• Información del cliente</li>
                  <li>• Detalles del servicio</li>
                  <li>• Diagnóstico técnico (si aplica)</li>
                  <li>• Fotografías (si están disponibles)</li>
                  <li>• Información financiera</li>
                </ul>
                
                {/* Información específica de la ficha */}
                <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">Servicio:</span>
                      <p className="text-gray-600 truncate">{showPDFModal.ficha.servicio_nombre || showPDFModal.ficha.servicio}</p>
                    </div>
                    <div>
                      <span className="font-medium">Fecha:</span>
                      <p className="text-gray-600">{formatFechaCorrecida(showPDFModal.ficha.fecha_ficha)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={closePDFModal}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (showPDFModal.ficha && showPDFModal.fichaId) {
                    handleDownloadPDF(showPDFModal.ficha, showPDFModal.fichaId);
                    closePDFModal();
                  }
                }}
                disabled={isGeneratingPDF === showPDFModal.fichaId}
                className="bg-gray-900 hover:bg-gray-800 text-xs text-white disabled:opacity-50"
                size="sm"
              >
                {isGeneratingPDF === showPDFModal.fichaId ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                    Generando...
                  </>
                ) : (
                  'Generar PDF'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <Button
            variant="ghost"
            onClick={onBack}
            className="-ml-1 gap-1 p-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            size="sm"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver
          </Button>

          {/* Botón de editar */}
          <Button
            onClick={handleEditClick}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-medium border border-gray-200">
            {client.nombre.charAt(0)}
          </div>

          <div>
            <h1 className="text-base font-medium text-gray-900">{client.nombre}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-500">{client.email}</p>
              <span className="text-gray-300">•</span>
              <p className="text-xs text-gray-500">{client.telefono}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="space-y-4">
          {/* SECCIÓN DE FICHAS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Fichas</h2>
              <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                {fichasCargando ? 'Cargando...' : `${totalFichas} servicios`}
              </div>
            </div>

            {fichasCargando ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Cargando servicios...</p>
              </div>
            ) : totalFichas > 0 ? (
              <div className="space-y-3">
                {fichasCliente.map((ficha) => {
                  const servicioNombre = ficha.servicio_nombre || ficha.servicio || 'Servicio'
                  const profesionalNombre = ficha.profesional_nombre || 'Sin profesional'
                  const sedeNombre = formatSedeNombre(ficha.sede_nombre || ficha.sede || ficha.local, 'Sin sede')
                  const tieneDiagnostico = ficha.datos_especificos || (ficha.respuestas && ficha.respuestas.length > 0)
                  const isExpanded = expandedFichas.has(ficha._id)

                  const tieneImagenes =
                    (ficha.antes_url && ficha.antes_url !== '') ||
                    (ficha.despues_url && ficha.despues_url !== '') ||
                    (ficha.fotos?.antes && Array.isArray(ficha.fotos.antes) && ficha.fotos.antes.length > 0) ||
                    (ficha.fotos?.despues && Array.isArray(ficha.fotos.despues) && ficha.fotos.despues.length > 0);

                  const primeraAntes = ficha.antes_url ? getSecureImageUrl(ficha.antes_url) : (ficha.fotos?.antes?.[0] ? getSecureImageUrl(ficha.fotos.antes[0]) : '');
                  const primeraDespues = ficha.despues_url ? getSecureImageUrl(ficha.despues_url) : (ficha.fotos?.despues?.[0] ? getSecureImageUrl(ficha.fotos.despues[0]) : '');

                  return (
                    <div key={ficha._id} className="rounded-lg border border-gray-100 bg-white p-3 hover:border-gray-200">
                      {/* Header de la ficha */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-gray-900">
                              {servicioNombre}
                            </h3>
                            {ficha.tipo_ficha === 'DIAGNOSTICO_RIZOTIPO' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-100">
                                <Activity className="h-2.5 w-2.5" />
                                Diagnóstico
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatFechaCorrecida(ficha.fecha_ficha)}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">{sedeNombre}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openPDFModal(ficha, ficha._id)}
                            disabled={isGeneratingPDF === ficha._id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Descargar PDF"
                          >
                            {isGeneratingPDF === ficha._id ? (
                              <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Generando...
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" />
                                PDF
                              </>
                            )}
                          </button>

                          {tieneImagenes && (
                            <button
                              onClick={() => openImagesModal(ficha)}
                              className="p-1 hover:bg-gray-50 rounded"
                              title="Ver imágenes"
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detalles básicos */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <User className="h-3 w-3" />
                            {profesionalNombre}
                          </div>
                          {ficha.notas_cliente && ficha.notas_cliente.trim() !== '' && (
                            <div className="flex items-start gap-2 text-xs">
                              <FileText className="h-3 w-3 text-gray-400 mt-0.5" />
                              <p className="text-gray-600">
                                {ficha.notas_cliente.length > 60 ? ficha.notas_cliente.substring(0, 60) + '...' : ficha.notas_cliente}
                              </p>
                            </div>
                          )}
                        </div>

                        {tieneImagenes && (
                          <div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="relative">
                                <div className="h-16 rounded border border-gray-200 overflow-hidden">
                                  {primeraAntes ? (
                                    <img
                                      src={primeraAntes}
                                      alt="Antes"
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjEwMCIgeT0iNzUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzZCNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5BbnRlczwvdGV4dD48L3N2Zz4=';
                                      }}
                                    />
                                  ) : (
                                    <div className="h-full w-full bg-gray-50 flex items-center justify-center">
                                      <span className="text-xs text-gray-400">Antes</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="relative">
                                <div className="h-16 rounded border border-gray-200 overflow-hidden">
                                  {primeraDespues ? (
                                    <img
                                      src={primeraDespues}
                                      alt="Después"
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjEwMCIgeT0iNzUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzZCNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5EZXNwdWVzPC90ZXh0Pjwvc3ZnPg==';
                                      }}
                                    />
                                  ) : (
                                    <div className="h-full w-full bg-gray-50 flex items-center justify-center">
                                      <span className="text-xs text-gray-400">Después</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SECCIÓN DE DIAGNÓSTICO RIZOTIPO */}
                      {tieneDiagnostico && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => toggleFichaExpansion(ficha._id)}
                            className="flex items-center justify-between w-full text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Activity className="h-4 w-4 text-purple-500" />
                              <span className="text-xs font-medium text-gray-900">
                                Diagnóstico Rizotipo
                              </span>
                              <span className="text-xs text-gray-500">
                                {ficha.respuestas?.length || 0} parámetros analizados
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-3">
                              {/* Respuestas del cuestionario */}
                              {ficha.respuestas && ficha.respuestas.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    Análisis Capilar
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {ficha.respuestas.map((respuesta, index) => (
                                      <div
                                        key={index}
                                        className={`px-2 py-1.5 rounded border text-xs ${getDiagnosticoColor(respuesta.respuesta)}`}
                                      >
                                        <div className="flex items-center gap-1 mb-0.5">
                                          {getDiagnosticoIcon(respuesta.respuesta)}
                                          <span className="font-medium">{respuesta.pregunta.split(' ')[0]}</span>
                                        </div>
                                        <div className="font-medium">{respuesta.respuesta}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Datos específicos */}
                              {ficha.datos_especificos && (
                                <div className="space-y-2">
                                  {/* Recomendaciones personalizadas */}
                                  {ficha.datos_especificos.recomendaciones_personalizadas && (
                                    <div className="p-2 rounded bg-green-50 border border-green-100">
                                      <div className="flex items-start gap-2">
                                        <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs">
                                          <div className="font-medium text-green-800 mb-1">Recomendaciones personalizadas</div>
                                          <p className="text-green-700">{ficha.datos_especificos.recomendaciones_personalizadas}</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Frecuencia de corte */}
                                  {ficha.datos_especificos.frecuencia_corte && (
                                    <div className="flex items-center gap-3 text-xs">
                                      <Scissors className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                      <div>
                                        <span className="font-medium text-gray-700">Frecuencia de corte:</span>
                                        <span className="text-gray-600 ml-1">{ficha.datos_especificos.frecuencia_corte}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Técnicas de estilizado */}
                                  {ficha.datos_especificos.tecnicas_estilizado && (
                                    <div className="flex items-start gap-3 text-xs">
                                      <Zap className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <div className="font-medium text-gray-700 mb-0.5">Técnicas de estilizado</div>
                                        <p className="text-gray-600">{ficha.datos_especificos.tecnicas_estilizado}</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Productos sugeridos */}
                                  {ficha.datos_especificos.productos_sugeridos && (
                                    <div className="flex items-start gap-3 text-xs">
                                      <ShoppingBag className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <div className="font-medium text-gray-700 mb-0.5">Productos sugeridos</div>
                                        <p className="text-gray-600 whitespace-pre-line">{ficha.datos_especificos.productos_sugeridos}</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Observaciones generales */}
                                  {ficha.datos_especificos.observaciones_generales && (
                                    <div className="flex items-start gap-3 text-xs">
                                      <AlertCircle className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <div className="font-medium text-gray-700 mb-0.5">Observaciones generales</div>
                                        <p className="text-gray-600">{ficha.datos_especificos.observaciones_generales}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {ficha.comentario_interno && ficha.comentario_interno.trim() !== '' && !ficha.datos_especificos?.recomendaciones_personalizadas && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex items-start gap-2 text-xs">
                            <Tag className="h-3 w-3 text-gray-400 mt-0.5" />
                            <p className="text-gray-600">
                              {ficha.comentario_interno.length > 80 ? ficha.comentario_interno.substring(0, 80) + '...' : ficha.comentario_interno}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No hay servicios registrados</p>
              </div>
            )}
          </div>

          {/* Historial de cabello */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                Historial de Cabello
              </h2>
            </div>
            <div className="rounded-lg border border-gray-100 p-3">
              {client.historialCabello && client.historialCabello.length > 0 ? (
                <div className="space-y-2">
                  {client.historialCabello.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                      <span className="text-sm text-gray-700">{item.tipo}</span>
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                        {formatDateDMY(item.fecha, item.fecha)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Scissors className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                  <p className="text-sm text-gray-500">Sin historial</p>
                </div>
              )}
            </div>
          </div>

          {/* Historial de productos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Historial de Compras
              </h2>
            </div>
            {client.historialProductos && client.historialProductos.length > 0 ? (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Producto</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Fecha</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700 text-xs">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.historialProductos.map((producto, index) => (
                        <tr key={index} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-700 text-sm">{producto.producto}</td>
                          <td className="px-3 py-2 text-gray-500 text-sm">
                            {formatFechaCorrecida(producto.fecha)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${producto.estado_pago === 'pagado'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                              }`}>
                              {producto.estado_pago || 'pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
                <ShoppingBag className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No hay compras registradas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
