// src/components/fichas/FichaCuidadoPostColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Cita } from '../../../../types/fichas';
import { Camera, Loader2, X, Save, CheckCircle, Check } from "lucide-react";
import { API_BASE_URL } from '../../../../types/config';

interface FichaCuidadoPostColorProps {
  cita: Cita;
  datosIniciales?: any;
  onGuardar?: (datos: any) => void;
  onSubmit: (data: any) => void;
  onCancelar?: () => void;
}

const recomendacionesPredeterminadas = [
  "No lavar con agua caliente",
  "No usar shampoos fuertes",
  "Evitar piscina por 1 mes sin cuidados",
  "Usar gorro y acondicionador antes de piscina",
  "Usar productos profesionales recomendados",
  "Evitar exposición prolongada al sol",
  "Usar protector térmico al planchar o secar",
  "Seguir rutina de cuidado específica"
];

export function FichaCuidadoPostColor({ cita, datosIniciales, onGuardar, onSubmit, onCancelar }: FichaCuidadoPostColorProps) {
  const [formData, setFormData] = useState({
    autorizacion_publicacion: false,
    firma_profesional: false,
    foto_actual: [] as File[],
    observaciones_personalizadas: "",
    tenga_en_cuenta: "",
    recomendaciones_seleccionadas: recomendacionesPredeterminadas.map(() => false)
  });

  const [loading, setLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState<{
    actual: string[];
  }>({ actual: [] });

  const fileInputRefActual = useRef<HTMLInputElement>(null);

  // Cargar datos iniciales del localStorage al montar
  useEffect(() => {
    const savedData = localStorage.getItem(`ficha_cuidado_post_color_${cita.cita_id}`);
    if (savedData) {
      const parsedData = JSON.parse(savedData);

      // Nota: No podemos guardar Files en localStorage, solo el estado del formulario
      setFormData({
        ...parsedData,
        foto_actual: [] // Los archivos no se pueden guardar, se limpian
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
      foto_actual: [] // No guardamos archivos
    };
    localStorage.setItem(`ficha_cuidado_post_color_${cita.cita_id}`, JSON.stringify(dataToSave));
  }, [formData, cita.cita_id]);

  // Limpiar previews cuando el componente se desmonte
  useEffect(() => {
    return () => {
      previewImages.actual.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewImages]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    const currentFiles = formData.foto_actual;

    // Limitar a 5 imágenes máximo
    const remainingSlots = 5 - currentFiles.length;
    if (remainingSlots <= 0) {
      alert(`Máximo 5 imágenes permitidas`);
      return;
    }

    const filesToAdd = newFiles.slice(0, remainingSlots);

    // Actualizar estado de archivos
    setFormData(prev => ({
      ...prev,
      foto_actual: [...currentFiles, ...filesToAdd]
    }));

    // Crear URLs para preview
    const newPreviews = filesToAdd.map(file => URL.createObjectURL(file));
    setPreviewImages(prev => ({
      ...prev,
      actual: [...prev.actual, ...newPreviews]
    }));
  };

  const handleRemoveImage = (index: number) => {
    // Revocar URL
    if (previewImages.actual[index]) {
      URL.revokeObjectURL(previewImages.actual[index]);
    }

    // Actualizar estado
    setFormData(prev => ({
      ...prev,
      foto_actual: prev.foto_actual.filter((_, i) => i !== index)
    }));

    setPreviewImages(prev => ({
      ...prev,
      actual: prev.actual.filter((_, i) => i !== index)
    }));
  };

  const openFileSelector = () => {
    fileInputRefActual.current?.click();
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleRecomendacion = (index: number) => {
    setFormData(prev => {
      const nuevasSelecciones = [...prev.recomendaciones_seleccionadas];
      nuevasSelecciones[index] = !nuevasSelecciones[index];
      return { ...prev, recomendaciones_seleccionadas: nuevasSelecciones };
    });
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

    // Verificar que se haya seleccionado al menos una recomendación
    const alMenosUnaRecomendacion = formData.recomendaciones_seleccionadas.some(r => r === true);
    if (!alMenosUnaRecomendacion) {
      alert('Debe seleccionar al menos una recomendación de cuidado');
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
          const estilistaId = cita.estilista_id;
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
            id: estilistaId,
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
      formData.foto_actual.forEach((file) => {
        formDataToSend.append('fotos_actual', file);
      });

      // 3. Obtener recomendaciones aplicadas
      const recomendacionesAplicadas = recomendacionesPredeterminadas.filter(
        (_, index) => formData.recomendaciones_seleccionadas[index]
      );

      // 4. Preparar datos según el modelo FichaCreate
      const fichaData = {
        // Campos REQUERIDOS
        cliente_id: cita.cliente.cliente_id,
        servicio_id: cita.servicios?.[0]?.servicio_id || "",
        profesional_id: estilistaData.id,
        sede_id: cita.sede?.sede_id || 'sede_default',
        tipo_ficha: "CUIDADO_POST_COLOR",

        // Información básica
        servicio_nombre: cita.servicios?.map((s: any) => s.nombre).join(', ') || "",
        profesional_nombre: estilistaData.nombre,
        profesional_email: estilistaData.email,
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
          observaciones_personalizadas: formData.observaciones_personalizadas || "",
          tenga_en_cuenta: formData.tenga_en_cuenta || "",
          recomendaciones_aplicadas: recomendacionesAplicadas,
          autorizacion_publicacion: formData.autorizacion_publicacion
        },
        respuestas: recomendacionesPredeterminadas.map((rec, index) => ({
          pregunta_id: index + 1,
          pregunta: rec,
          respuesta: formData.recomendaciones_seleccionadas[index] ? "Aplica" : "No aplica",
          observaciones: "",
          respondido_por: estilistaData.nombre,
          respondido_por_id: estilistaData.id
        })),
        descripcion_servicio: `Recomendaciones de cuidado post color para ${cita.servicios?.map((s: any) => s.nombre).join(', ') || 'Sin servicio'} - Realizado por ${estilistaData.nombre}`,

        // Fotos (URLs vacías porque el backend las subirá a S3)
        fotos_actual: [],
        fotos_despues: [],

        // Permisos y comentarios
        autorizacion_publicacion: formData.autorizacion_publicacion,
        comentario_interno: formData.observaciones_personalizadas || ""
      };

      // 5. Debug info
      console.log("📤 Enviando datos de ficha CUIDADO_POST_COLOR:", fichaData);
      console.log("👤 Estilista que crea la ficha:", estilistaData);

      // 6. Agregar el campo 'data' como string JSON
      formDataToSend.append('data', JSON.stringify(fichaData));

      // 7. Enviar petición
      const response = await fetch(`${API_BASE_URL}create-ficha`, {
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
        previewImages.actual.forEach(url => URL.revokeObjectURL(url));
        localStorage.removeItem(`ficha_cuidado_post_color_${cita.cita_id}`);

        // Notificar éxito
        alert(`✅ Ficha de Cuidado Post Color creada exitosamente por ${estilistaData.nombre}`);
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

  const renderImageUploader = () => {
    const files = formData.foto_actual;
    const previews = previewImages.actual;
    const fileInputRef = fileInputRefActual;

    return (
      <div>
        <h3 className="mb-3 font-semibold">Estado actual del color</h3>

        {/* Input de archivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Área de subida - LA IMAGEN SALE AQUÍ */}
        <div className="space-y-4">
          <div
            className="relative flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={openFileSelector}
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
                        alt={`Estado actual ${index + 2}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index + 1)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-gray-500 text-white rounded-full flex items-center justify-center hover:bg-gray-600"
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

  // Verificar si se ha seleccionado al menos una recomendación
  const alMenosUnaRecomendacion = formData.recomendaciones_seleccionadas.some(r => r === true);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold mb-2">Ficha - Recomendaciones para el Cuidado Post Color</h2>
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
      <div>
        {renderImageUploader()}
      </div>

      {/* Recomendaciones de Cuidado */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Recomendaciones de Cuidado</h3>
        <p className="text-sm text-gray-600 mb-4">
          Selecciona las recomendaciones que aplican para este cliente:
        </p>

        {recomendacionesPredeterminadas.map((recomendacion, index) => (
          <div 
            key={index}
            className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              formData.recomendaciones_seleccionadas[index] 
                ? 'bg-gray-50 border-gray-200' 
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
            onClick={() => toggleRecomendacion(index)}
          >
            <div className={`flex items-center justify-center w-5 h-5 border rounded ${
              formData.recomendaciones_seleccionadas[index] 
                ? 'bg-gray-500 border-gray-500 text-white' 
                : 'border-gray-300'
            }`}>
              {formData.recomendaciones_seleccionadas[index] && <Check className="w-3 h-3" />}
            </div>
            <span className="text-sm flex-1">{recomendacion}</span>
          </div>
        ))}
      </div>

      {/* Observaciones Personalizadas */}
      <div>
        <label className="block text-sm font-medium mb-2">Observaciones Personalizadas</label>
        <textarea 
          className="w-full p-3 border rounded-lg h-24"
          value={formData.observaciones_personalizadas}
          onChange={(e) => handleInputChange('observaciones_personalizadas', e.target.value)}
          placeholder="Agrega observaciones específicas para este cliente..."
        />
      </div>

      {/* Tenga en cuenta */}
      <div>
        <label className="block text-sm font-medium mb-2">Tenga en cuenta</label>
        <textarea 
          className="w-full p-3 border rounded-lg h-20"
          value={formData.tenga_en_cuenta}
          onChange={(e) => handleInputChange('tenga_en_cuenta', e.target.value)}
          placeholder="Información adicional importante que el cliente debe considerar..."
        />
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
      <div className="flex items-center space-x-2 p-4 border rounded-lg bg-gray-50">
        <input
          type="checkbox"
          id="firma"
          checked={formData.firma_profesional}
          onChange={(e) => handleInputChange('firma_profesional', e.target.checked)}
          className="w-5 h-5 text-gray-600"
          required
        />
        <label htmlFor="firma" className="text-sm font-medium flex-1">
          <span className="font-bold">Incluir firma del profesional</span>
          <p className="text-gray-600 text-xs mt-1">
            Confirma que como profesional a cargo, te responsabilizas por las recomendaciones dadas.
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
          disabled={loading || !formData.firma_profesional || !alMenosUnaRecomendacion}
          className={`flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center ${loading || !formData.firma_profesional || !alMenosUnaRecomendacion
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-600 text-white hover:bg-gray-700'
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
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-700 text-sm">
            ⚠️ Debe incluir su firma como profesional para crear la ficha.
          </p>
        </div>
      )}

      {!alMenosUnaRecomendacion && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-700 text-sm">
            ⚠️ Debe seleccionar al menos una recomendación de cuidado.
          </p>
        </div>
      )}

      {/* Nota sobre guardado automático */}
      <div className="p-2 bg-gray-50 border border-gray-200 rounded text-center">
        <p className="text-xs text-gray-600">
          💾 Los datos se guardan automáticamente (excepto las imágenes).
          Puedes cerrar y continuar más tarde.
        </p>
      </div>
    </form>
  );
}