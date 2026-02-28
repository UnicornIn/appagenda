// src/components/fichas/FichaDiagnosticoRizotipo.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Cita } from '../../../../types/fichas';
import { Camera, Loader2, X, Save, CheckCircle } from "lucide-react";
import { API_BASE_URL } from '../../../../types/config';

interface FichaDiagnosticoRizotipoProps {
  cita: Cita;
  datosIniciales?: any;
  onGuardar?: (datos: any) => void;
  onSubmit: (data: any) => void;
  onCancelar?: () => void;
}

export function FichaDiagnosticoRizotipo({ cita, datosIniciales, onGuardar, onSubmit, onCancelar }: FichaDiagnosticoRizotipoProps) {
  const [formData, setFormData] = useState({
    autorizacion_publicacion: false,
    firma_profesional: false,
    foto_antes: [] as File[],
    foto_despues: [] as File[],
    plasticidad: "",
    permeabilidad: "",
    porosidad: "",
    exterior_lipidico: "",
    densidad: "",
    oleosidad: "",
    grosor: "",
    textura: "",
    recomendaciones_personalizadas: "",
    frecuencia_corte: "",
    tecnicas_estilizado: "",
    productos_sugeridos: "",
    observaciones_generales: ""
  });

  const [loading, setLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState<{
    antes: string[];
    despues: string[];
  }>({ antes: [], despues: [] });

  const fileInputRefAntes = useRef<HTMLInputElement>(null);
  const fileInputRefDespues = useRef<HTMLInputElement>(null);

  // Cargar datos iniciales del localStorage al montar
  useEffect(() => {
    const savedData = localStorage.getItem(`ficha_diagnostico_rizotipo_${cita.cita_id}`);
    if (savedData) {
      const parsedData = JSON.parse(savedData);

      // Nota: No podemos guardar Files en localStorage, solo el estado del formulario
      setFormData({
        ...parsedData,
        foto_antes: [], // Los archivos no se pueden guardar, se limpian
        foto_despues: [] // Los archivos no se pueden guardar, se limpian
      });
    } else if (datosIniciales) {
      setFormData(datosIniciales);
    }
  }, [cita.cita_id, datosIniciales]);

  // Guardar automáticamente en localStorage cuando cambian los datos
  useEffect(() => {
    // No guardamos los archivos en localStorage (son demasiado grandes)
    const dataToSave = {
      ...formData,
      foto_antes: [], // No guardamos archivos
      foto_despues: [] // No guardamos archivos
    };
    localStorage.setItem(`ficha_diagnostico_rizotipo_${cita.cita_id}`, JSON.stringify(dataToSave));
  }, [formData, cita.cita_id]);

  // Limpiar previews cuando el componente se desmonte
  useEffect(() => {
    return () => {
      previewImages.antes.forEach(url => URL.revokeObjectURL(url));
      previewImages.despues.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewImages]);

  const handleFileSelect = (tipo: 'antes' | 'despues', files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    const currentFiles = tipo === 'antes' ? formData.foto_antes : formData.foto_despues;

    // Limitar a 5 imágenes máximo
    const remainingSlots = 5 - currentFiles.length;
    if (remainingSlots <= 0) {
      alert(`Máximo 5 imágenes permitidas para ${tipo === 'antes' ? 'antes' : 'después'}`);
      return;
    }

    const filesToAdd = newFiles.slice(0, remainingSlots);

    // Actualizar estado de archivos
    setFormData(prev => ({
      ...prev,
      [`foto_${tipo}`]: [...currentFiles, ...filesToAdd]
    }));

    // Crear URLs para preview
    const newPreviews = filesToAdd.map(file => URL.createObjectURL(file));
    setPreviewImages(prev => ({
      ...prev,
      [tipo]: [...prev[tipo], ...newPreviews]
    }));
  };

  const handleRemoveImage = (tipo: 'antes' | 'despues', index: number) => {
    // Revocar URL
    if (previewImages[tipo][index]) {
      URL.revokeObjectURL(previewImages[tipo][index]);
    }

    // Actualizar estado
    const key = tipo === 'antes' ? 'foto_antes' : 'foto_despues';
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index)
    }));

    setPreviewImages(prev => ({
      ...prev,
      [tipo]: prev[tipo].filter((_, i) => i !== index)
    }));
  };

  const openFileSelector = (tipo: 'antes' | 'despues') => {
    if (tipo === 'antes') {
      fileInputRefAntes.current?.click();
    } else {
      fileInputRefDespues.current?.click();
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveDraft = () => {
    if (onGuardar) {
      const draftData = {
        ...formData,
        fecha_guardado: new Date().toISOString(),
        estado: 'borrador'
      };
      onGuardar(draftData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (!formData.firma_profesional) {
      alert('Debe incluir su firma como profesional para crear la ficha');
      return;
    }

    // Verificar parámetros técnicos obligatorios
    const parametrosObligatorios = [
      'plasticidad', 'permeabilidad', 'porosidad', 'exterior_lipidico',
      'densidad', 'oleosidad', 'grosor', 'textura'
    ];

    const parametrosFaltantes = parametrosObligatorios.filter(
      param => !formData[param as keyof typeof formData]
    );

    if (parametrosFaltantes.length > 0) {
      alert(`Debe completar todos los parámetros técnicos. Faltantes: ${parametrosFaltantes.join(', ')}`);
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      // Función para obtener datos del estilista desde sessionStorage
      const getEstilistaData = () => {
        try {
          const estilistaNombre = sessionStorage.getItem('beaux-name') || "Estilista";
          const estilistaEmail = sessionStorage.getItem('beaux-email') || "";
          // Usar el estilista_id de la cita que es el ID real en la base de datos
          const estilistaId = cita.estilista_id; // ← CORRECCIÓN AQUÍ
          const estilistaRole = sessionStorage.getItem('beaux-role') || "estilista";

          // Formatear el nombre si viene como email
          let nombreFormateado = estilistaNombre;
          if (estilistaNombre.includes('@')) {
            const namePart = estilistaNombre.split('@')[0];
            nombreFormateado = namePart
              .replace(/[._]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }

          return {
            nombre: nombreFormateado,
            email: estilistaEmail,
            id: estilistaId, // ← ID REAL del profesional
            role: estilistaRole
          };
        } catch (error) {
          console.error('Error obteniendo datos del estilista:', error);
          return {
            nombre: "Estilista",
            email: "",
            id: cita.estilista_id,
            role: "estilista"
          };
        }
      };

      // Obtener datos del estilista actual
      const estilistaData = getEstilistaData();
      console.log('📋 Datos del estilista:', estilistaData);

      // 1. Crear FormData
      const formDataToSend = new FormData();

      // 2. Agregar archivos
      formData.foto_antes.forEach((file) => {
        formDataToSend.append('fotos_antes', file);
      });

      formData.foto_despues.forEach((file) => {
        formDataToSend.append('fotos_despues', file);
      });

      // 3. Preparar datos según el modelo FichaCreate
      const fichaData = {
        // Campos REQUERIDOS
        cliente_id: cita.cliente.cliente_id,
        servicio_id: cita.servicios?.[0]?.servicio_id || "",
        profesional_id: estilistaData.id, // ← ESTE ES EL ID CORRECTO
        sede_id: cita.sede?.sede_id || 'sede_default',
        tipo_ficha: "DIAGNOSTICO_RIZOTIPO",

        // Información básica
        servicio_nombre: cita.servicios?.map((s: any) => s.nombre).join(', ') || "",
        profesional_nombre: estilistaData.nombre,
        profesional_email: estilistaData.email, // ← Puedes agregar el email también
        fecha_ficha: new Date().toISOString(),
        fecha_reserva: cita.fecha || "",

        // Datos personales
        email: cita.cliente.email || "",
        nombre: cita.cliente.nombre || "",
        apellido: cita.cliente.apellido || "",
        cedula: "",
        telefono: cita.cliente.telefono || "",

        // Información financiera
        precio: cita.precio_total || cita.servicios?.reduce((sum: number, s: any) => sum + (s.precio || 0), 0) || 0,
        estado: "completado",
        estado_pago: "pagado",

        // Contenido de la ficha
        datos_especificos: {
          cita_id: cita.cita_id,
          firma_profesional: formData.firma_profesional,
          fecha_firma: new Date().toISOString(),
          profesional_firmante: estilistaData.nombre,
          profesional_firmante_id: estilistaData.id,
          profesional_firmante_email: estilistaData.email,
          plasticidad: formData.plasticidad,
          permeabilidad: formData.permeabilidad,
          porosidad: formData.porosidad,
          exterior_lipidico: formData.exterior_lipidico,
          densidad: formData.densidad,
          oleosidad: formData.oleosidad,
          grosor: formData.grosor,
          textura: formData.textura,
          recomendaciones_personalizadas: formData.recomendaciones_personalizadas || "",
          frecuencia_corte: formData.frecuencia_corte || "",
          tecnicas_estilizado: formData.tecnicas_estilizado || "",
          productos_sugeridos: formData.productos_sugeridos || "",
          observaciones_generales: formData.observaciones_generales || "",
          autorizacion_publicacion: formData.autorizacion_publicacion
        },
        respuestas: [
          {
            pregunta_id: 1,
            pregunta: "Plasticidad",
            respuesta: formData.plasticidad,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 2,
            pregunta: "Permeabilidad",
            respuesta: formData.permeabilidad,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 3,
            pregunta: "Porosidad",
            respuesta: formData.porosidad,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 4,
            pregunta: "Exterior Lipídico",
            respuesta: formData.exterior_lipidico,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 5,
            pregunta: "Densidad",
            respuesta: formData.densidad,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 6,
            pregunta: "Oleosidad",
            respuesta: formData.oleosidad,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 7,
            pregunta: "Grosor",
            respuesta: formData.grosor,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          },
          {
            pregunta_id: 8,
            pregunta: "Textura",
            respuesta: formData.textura,
            observaciones: "",
            respondido_por: estilistaData.nombre,
            respondido_por_id: estilistaData.id
          }
        ],
        descripcion_servicio: `Diagnóstico rizotipo para ${cita.servicios?.map((s: any) => s.nombre).join(', ') || 'Sin servicio'} - Realizado por ${estilistaData.nombre}`,

        // Fotos (URLs vacías porque el backend las subirá a S3)
        fotos_antes: [],
        fotos_despues: [],

        // Permisos y comentarios
        autorizacion_publicacion: formData.autorizacion_publicacion,
        comentario_interno: formData.observaciones_generales || ""
      };

      // 4. Debug info
      console.log("📤 Enviando datos de ficha DIAGNOSTICO_RIZOTIPO:", fichaData);
      console.log("👤 Estilista que crea la ficha:", estilistaData);

      // 5. Agregar el campo 'data' como string JSON
      formDataToSend.append('data', JSON.stringify(fichaData));

      // 6. Enviar petición
      const response = await fetch(`${API_BASE_URL}scheduling/quotes/create-ficha`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formDataToSend,
      });

      console.log("📥 Response status:", response.status);

      if (!response.ok) {
        let errorText = await response.text();
        console.error("❌ Error response text:", errorText);

        try {
          const errorJson = JSON.parse(errorText);
          console.error("❌ Error JSON:", errorJson);

          if (response.status === 422 && errorJson.detail) {
            const validationErrors = errorJson.detail;
            const errorMessages = validationErrors.map((err: any) =>
              `Campo ${err.loc[1]}: ${err.msg}`
            ).join('\n');
            throw new Error(`Errores de validación:\n${errorMessages}`);
          }
          throw new Error(errorJson.detail || errorJson.message || `Error ${response.status}`);
        } catch {
          throw new Error(`Error ${response.status}: ${errorText || response.statusText}`);
        }
      }

      const data = await response.json();
      console.log("✅ Success response:", data);

      if (data.success) {
        // Limpiar previews y datos del localStorage
        previewImages.antes.forEach(url => URL.revokeObjectURL(url));
        previewImages.despues.forEach(url => URL.revokeObjectURL(url));
        localStorage.removeItem(`ficha_diagnostico_rizotipo_${cita.cita_id}`);

        // Notificar éxito
        alert(`✅ Ficha de Diagnóstico Rizotipo creada exitosamente por ${estilistaData.nombre}`);
        onSubmit(data);
      } else {
        throw new Error(data.message || 'Error al crear la ficha');
      }

    } catch (error) {
      console.error('❌ Error al crear ficha:', error);
      alert(error instanceof Error ? error.message : 'Error al guardar la ficha');
    } finally {
      setLoading(false);
    }
  };

  const renderImageUploader = (tipo: 'antes' | 'despues', label: string) => {
    const files = tipo === 'antes' ? formData.foto_antes : formData.foto_despues;
    const previews = tipo === 'antes' ? previewImages.antes : previewImages.despues;
    const fileInputRef = tipo === 'antes' ? fileInputRefAntes : fileInputRefDespues;

    return (
      <div>
        <h3 className="mb-3 font-semibold">{label}</h3>

        {/* Input de archivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(tipo, e.target.files)}
        />

        {/* Área de subida - LA IMAGEN SALE AQUÍ */}
        <div className="space-y-4">
          <div
            className="relative flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => openFileSelector(tipo)}
          >
            {previews.length > 0 ? (
              // Mostrar primera imagen si hay
              <div className="w-full h-full p-2">
                <img
                  src={previews[0]}
                  alt="Vista previa"
                  className="w-full h-full object-cover rounded"
                />
                <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded">
                  <p className="text-white text-sm bg-black bg-opacity-70 px-3 py-1 rounded">
                    Haz clic para cambiar
                  </p>
                </div>
              </div>
            ) : (
              // Mostrar icono si no hay imágenes
              <div className="text-center">
                <Camera className="mx-auto mb-2 h-12 w-12 text-gray-400" />
                <p className="text-sm text-gray-600">Haz clic para buscar imágenes</p>
                <p className="text-xs text-gray-500 mt-1">
                  {files.length}/5 imágenes • Máx. 10MB por imagen
                </p>
                <p className="text-xs text-gray-500">o arrastra y suelta aquí</p>
              </div>
            )}
          </div>

          {/* Previsualización de imágenes adicionales */}
          {files.length > 1 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Imágenes adicionales ({files.length - 1}):
              </p>
              <div className="grid grid-cols-3 gap-2">
                {files.slice(1).map((_, index) => (
                  <div key={index + 1} className="relative">
                    <div className="aspect-square rounded-lg overflow-hidden border bg-gray-100">
                      <img
                        src={previews[index + 1]}
                        alt={`${label} ${index + 2}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(tipo, index + 1)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold mb-2">Ficha - Diagnóstico Rizotipo</h2>
          <p className="text-gray-600">
            Cliente: {cita.cliente.nombre} {cita.cliente.apellido}
          </p>
        </div>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Información de la cita */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Información del servicio</h3>
        <div className="grid grid-cols-2 gap-2">
          <p><strong>Cliente:</strong> {cita.cliente.nombre} {cita.cliente.apellido}</p>
          <p><strong>Servicio(s):</strong> {cita.servicios?.map((s: any) => s.nombre).join(', ') || 'Sin servicio'}</p>
          <p><strong>Fecha:</strong> {cita.fecha}</p>
          <p><strong>Hora:</strong> {cita.hora_inicio}</p>
        </div>
      </div>

      {/* Sección de imágenes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderImageUploader('antes', '📸 Estado actual (Foto antes)')}
        {renderImageUploader('despues', '📸 Resultado final (Foto después)')}
      </div>

      {/* Parámetros Técnicos */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Parámetros Técnicos</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Plasticidad *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.plasticidad}
              onChange={(e) => handleInputChange('plasticidad', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Medio</option>
              <option value="BAJA">Baja</option>
              <option value="MUY BAJA">Muy Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Permeabilidad *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.permeabilidad}
              onChange={(e) => handleInputChange('permeabilidad', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
              <option value="OTRA">Otra</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Porosidad *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.porosidad}
              onChange={(e) => handleInputChange('porosidad', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="ALTA">Alta</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Exterior Lipídico *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.exterior_lipidico}
              onChange={(e) => handleInputChange('exterior_lipidico', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Densidad *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.densidad}
              onChange={(e) => handleInputChange('densidad', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="EXTRA ALTA">Extra Alta</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Oleosidad *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.oleosidad}
              onChange={(e) => handleInputChange('oleosidad', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Grosor *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.grosor}
              onChange={(e) => handleInputChange('grosor', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="GRUESO">Grueso</option>
              <option value="MEDIO">Medio</option>
              <option value="DELGADO">Delgado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Textura *</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.textura}
              onChange={(e) => handleInputChange('textura', e.target.value)}
              required
            >
              <option value="">Seleccionar</option>
              <option value="Lanoso / Ulótrico">Lanoso / Ulótrico</option>
              <option value="Ensotijado / Lisótrico">Ensotijado / Lisótrico</option>
              <option value="Laminado / Cinótrico">Laminado / Cinótrico</option>
              <option value="Procesado o dañado">Procesado o dañado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Recomendaciones */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Recomendaciones</h3>

        <div>
          <label className="block text-sm font-medium mb-2">Recomendaciones Personalizadas</label>
          <textarea
            className="w-full p-2 border rounded-lg h-20"
            value={formData.recomendaciones_personalizadas}
            onChange={(e) => handleInputChange('recomendaciones_personalizadas', e.target.value)}
            placeholder="Escribe recomendaciones específicas para el cliente..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Frecuencia de Corte</label>
          <select
            className="w-full p-2 border rounded-lg"
            value={formData.frecuencia_corte}
            onChange={(e) => handleInputChange('frecuencia_corte', e.target.value)}
          >
            <option value="">Seleccionar</option>
            <option value="1 vez al año">1 vez al año</option>
            <option value="Cada 4 meses">Cada 4 meses</option>
            <option value="Cada 3 meses">Cada 3 meses</option>
            <option value="Cada 2 meses">Cada 2 meses</option>
            <option value="Cada mes">Cada mes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Técnicas de Estilizado Usadas Hoy</label>
          <input
            type="text"
            className="w-full p-2 border rounded-lg"
            value={formData.tecnicas_estilizado}
            onChange={(e) => handleInputChange('tecnicas_estilizado', e.target.value)}
            placeholder="Ej: Plancha, secado, etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Productos Sugeridos y Usados Hoy</label>
          <textarea
            className="w-full p-2 border rounded-lg h-20"
            value={formData.productos_sugeridos}
            onChange={(e) => handleInputChange('productos_sugeridos', e.target.value)}
            placeholder="Lista de productos recomendados y utilizados..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Observaciones Generales</label>
          <textarea
            className="w-full p-2 border rounded-lg h-20"
            value={formData.observaciones_generales}
            onChange={(e) => handleInputChange('observaciones_generales', e.target.value)}
            placeholder="Observaciones adicionales..."
          />
        </div>
      </div>

      {/* Autorización de publicación */}
      <div className="flex items-center space-x-2 p-4 border rounded-lg">
        <input
          type="checkbox"
          id="autoriza"
          checked={formData.autorizacion_publicacion}
          onChange={(e) => handleInputChange('autorizacion_publicacion', e.target.checked)}
          className="w-4 h-4"
        />
        <label htmlFor="autoriza" className="text-sm font-medium">
          ¿Autoriza publicar fotos en redes sociales?
        </label>
      </div>

      {/* FIRMA DEL PROFESIONAL - OBLIGATORIO */}
      <div className="flex items-center space-x-2 p-4 border rounded-lg bg-blue-50">
        <input
          type="checkbox"
          id="firma"
          checked={formData.firma_profesional}
          onChange={(e) => handleInputChange('firma_profesional', e.target.checked)}
          className="w-5 h-5 text-blue-600"
          required
        />
        <label htmlFor="firma" className="text-sm font-medium flex-1">
          <span className="font-bold">Incluir firma del profesional</span>
          <p className="text-gray-600 text-xs mt-1">
            Confirma que como profesional a cargo, te responsabilizas por el diagnóstico realizado.
          </p>
        </label>
      </div>

      {/* Botones de acción */}
      <div className="flex space-x-4 pt-4 border-t">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={loading}
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center"
        >
          <Save className="h-4 w-4 mr-2" />
          Guardar borrador
        </button>

        <button
          type="submit"
          disabled={loading || !formData.firma_profesional ||
            !formData.plasticidad || !formData.permeabilidad || !formData.porosidad ||
            !formData.exterior_lipidico || !formData.densidad || !formData.oleosidad ||
            !formData.grosor || !formData.textura}
          className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center ${loading || !formData.firma_profesional ||
            !formData.plasticidad || !formData.permeabilidad || !formData.porosidad ||
            !formData.exterior_lipidico || !formData.densidad || !formData.oleosidad ||
            !formData.grosor || !formData.textura
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
            }`}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin h-5 w-5 mr-2" />
              Creando ficha...
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 mr-2" />
              Crear Ficha Completa
            </>
          )}
        </button>
      </div>

      {/* Mensajes de validación */}
      {!formData.firma_profesional && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">
            ⚠️ Debe incluir su firma como profesional para crear la ficha.
          </p>
        </div>
      )}

      {/* Nota sobre guardado automático */}
      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-center">
        <p className="text-xs text-blue-600">
          💾 Los datos se guardan automáticamente (excepto las imágenes).
          Puedes cerrar y continuar más tarde.
        </p>
      </div>
    </form>
  );
}
