"use client"

import { useState, useEffect } from "react"    
import { Sidebar } from "../../../../components/Layout/Sidebar"
import { AppointmentSummary } from "../../../../components/Pago/appointment-summary"
import { PaymentOptions } from "../../../../components/Pago/payment-options"
import { PaymentMethodSelector } from "../../../../components/Pago/payment-method-selector"
import { Button } from "../../../../components/ui/button"
import { useLocation, useNavigate } from "react-router-dom"
import { crearCita } from '../../../../components/Quotes/citasApi'
import { useAuth } from '../../../../components/Auth/AuthContext'

// 🔥 INTERFAZ PARA LOS DATOS DE LA CITA
interface CitaParaPago {
    cliente: string;
    servicio: string;
    profesional: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    duracion: string;
    monto_total: number;
    cliente_id: string;
    profesional_id: string;
    servicio_id: string;
    sede_id: string;
    notas: string;
}

// 🔥 FUNCIÓN UTILITARIA PARA FORMATEAR FECHAS
const formatearFechaParaBackend = (fechaString: string): string => {
    try {
        console.log('📅 Formateando fecha:', fechaString);
        
        // Formato esperado: "Jueves, 27 de Febrero, 5:00 p.m."
        const fechaParts = fechaString.split(', ');
        if (fechaParts.length < 2) {
            throw new Error("Formato de fecha inválido");
        }

        // Extraer día, mes y año
        const diaMesPart = fechaParts[1]; // "27 de Febrero"
        const [dia, , mesStr] = diaMesPart.split(' ');
        
        if (!dia || !mesStr) {
            throw new Error("No se pudo extraer día y mes de la fecha");
        }
        
        // Mapear mes español a número
        const meses: { [key: string]: string } = {
            'Enero': '01', 'Febrero': '02', 'Marzo': '03', 'Abril': '04',
            'Mayo': '05', 'Junio': '06', 'Julio': '07', 'Agosto': '08',
            'Septiembre': '09', 'Octubre': '10', 'Noviembre': '11', 'Diciembre': '12'
        };
        
        const mesNum = meses[mesStr];
        if (!mesNum) {
            throw new Error(`Mes no reconocido: ${mesStr}`);
        }

        // Asumir año actual
        const añoActual = new Date().getFullYear();
        const fechaFormateada = `${añoActual}-${mesNum}-${dia.padStart(2, '0')}`;

        console.log('✅ Fecha formateada:', fechaFormateada);
        return fechaFormateada;
        
    } catch (error) {
        console.error('❌ Error formateando fecha:', error);
        throw new Error(`Error al procesar la fecha: ${fechaString}. Asegúrate de que tenga el formato correcto.`);
    }
};

export default function PagosPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // 🔥 NUEVO ESTADO PARA TIPO DE PROCESO
    const [selectedProcessType, setSelectedProcessType] = useState<"reserva" | "pago">("pago")
    const [selectedPaymentType, setSelectedPaymentType] = useState<"deposit" | "full">("full")
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("link")
    
    // 🔥 ABONO FIJO DE $50,000 COP
    const FIXED_DEPOSIT = 50000;
    
    // 🔥 ESTADOS DE CARGA Y ERROR
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // 🔥 ESTADO PARA LOS DATOS DE LA CITA
    const [appointment, setAppointment] = useState({
        client: "",
        service: "",
        professional: "",
        date: "",
        duration: "",
        totalAmount: 0,
    })

    // 🔥 DETERMINAR SI SE PUEDE HACER ABONO
    const canHaveDeposit = appointment.totalAmount > FIXED_DEPOSIT;

    // 🔥 CARGAR DATOS DE LA CITA AL MONTAR EL COMPONENTE
    useEffect(() => {
        if (location.state?.cita) {
            const cita: CitaParaPago = location.state.cita;
            
            setAppointment({
                client: cita.cliente,
                service: cita.servicio,
                professional: cita.profesional,
                date: cita.fecha,
                duration: cita.duracion,
                totalAmount: cita.monto_total,
            });

            // 🔥 SI EL SERVICIO ES MENOR O IGUAL A $50,000, FORZAR PAGO COMPLETO
            if (cita.monto_total <= FIXED_DEPOSIT) {
                setSelectedPaymentType("full");
                setSelectedProcessType("pago"); // Forzar pago para servicios económicos
            }
        }
    }, [location.state]);

    // 🔥 FUNCIÓN PARA CREAR CITA DIRECTA (SIN PAGO)
    const handleCreateAppointment = async () => {
        if (!location.state?.cita || !user?.access_token) {
            setError("Datos de la cita no disponibles");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const citaData = location.state.cita;
            
            // 🔥 CONVERTIR FECHA AL FORMATO CORRECTO
            const fechaFormateada = formatearFechaParaBackend(citaData.fecha);

            // Preparar datos para crear la cita
            const citaParaCrear = {
                sede_id: citaData.sede_id,
                cliente_id: citaData.cliente_id,
                profesional_id: citaData.profesional_id,
                servicio_id: citaData.servicio_id,
                fecha: fechaFormateada,
                hora_inicio: citaData.hora_inicio,
                hora_fin: citaData.hora_fin,
                estado: "confirmada",
                notas: citaData.notas,
                cliente_nombre: citaData.cliente,
                tipo_pago: "reserva_directa", // 🔥 INDICAR QUE ES RESERVA DIRECTA
                monto_abonado: 0,
                monto_total: citaData.monto_total
            };

            console.log('📤 Creando cita sin pago:', citaParaCrear);

            const resultado = await crearCita(citaParaCrear, user.access_token);
            
            console.log('✅ Cita creada exitosamente:', resultado);
            
            alert(`✅ Cita confirmada exitosamente para ${citaData.cliente}`);
            
            // 🔥 REDIRIGIR AL CALENDARIO
            navigate('/superadmin/appointments');
            
        } catch (error: any) {
            console.error('❌ ERROR CREANDO CITA:', error);
            setError(error.message || "Error al crear la cita");
        } finally {
            setLoading(false);
        }
    }

    // 🔥 FUNCIÓN PARA PROCESAR PAGO CON ABONO O PAGO COMPLETO
    const handleProcessPayment = async () => {
        if (!location.state?.cita || !user?.access_token) {
            setError("Datos de la cita no disponibles");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const citaData = location.state.cita;
            const fechaFormateada = formatearFechaParaBackend(citaData.fecha);
            
            // 🔥 DETERMINAR MONTO A PAGAR Y ESTADO
            let montoPagado = 0;
            let estadoCita = "pendiente_pago"; // Estado inicial
            let tipoPago = "";
            
            if (selectedPaymentType === "deposit" && canHaveDeposit) {
                montoPagado = FIXED_DEPOSIT;
                estadoCita = "confirmada"; // Con abono se confirma
                tipoPago = "abono";
            } else if (selectedPaymentType === "full") {
                montoPagado = appointment.totalAmount;
                estadoCita = "pagada"; // Pago completo
                tipoPago = "completo";
            }

            // Preparar datos para crear la cita con pago
            const citaParaCrear = {
                sede_id: citaData.sede_id,
                cliente_id: citaData.cliente_id,
                profesional_id: citaData.profesional_id,
                servicio_id: citaData.servicio_id,
                fecha: fechaFormateada,
                hora_inicio: citaData.hora_inicio,
                hora_fin: citaData.hora_fin,
                estado: estadoCita,
                notas: citaData.notas,
                cliente_nombre: citaData.cliente,
                tipo_pago: tipoPago,
                monto_abonado: montoPagado,
                monto_total: citaData.monto_total,
                metodo_pago: selectedPaymentMethod // 🔥 GUARDAR MÉTODO DE PAGO
            };

            console.log('📤 Creando cita con pago:', citaParaCrear);

            // 🔥 AQUÍ DEBERÍAS LLAMAR A TU API DE PAGO
            // Por ahora simulamos con un timeout
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // 🔥 DESPUÉS DEL PAGO EXITOSO, CREAMOS LA CITA
            const resultado = await crearCita(citaParaCrear, user.access_token);
            
            console.log('✅ Cita con pago creada exitosamente:', resultado);
            
            // 🔥 MOSTRAR MENSAJE DE CONFIRMACIÓN
            let mensajeConfirmacion = "";
            if (selectedPaymentType === "deposit" && canHaveDeposit) {
                mensajeConfirmacion = `✅ Abono de $${FIXED_DEPOSIT.toLocaleString()} COP procesado exitosamente para ${citaData.cliente}. La cita está confirmada.`;
            } else {
                mensajeConfirmacion = `✅ Pago completo de $${appointment.totalAmount.toLocaleString()} COP procesado exitosamente para ${citaData.cliente}.`;
            }
            
            alert(mensajeConfirmacion);
            
            // 🔥 REDIRIGIR AL CALENDARIO
            navigate('/superadmin/appointments');
            
        } catch (error: any) {
            console.error('❌ ERROR PROCESANDO PAGO:', error);
            setError(error.message || "Error al procesar el pago");
        } finally {
            setLoading(false);
        }
    }

    // 🔥 FUNCIÓN PRINCIPAL PARA CONFIRMAR
    const handleConfirm = () => {
        if (selectedProcessType === "reserva") {
            handleCreateAppointment();
        } else {
            handleProcessPayment();
        }
    }

    const handleCancel = () => {
        // 🔥 VOLVER A LA PÁGINA ANTERIOR (CALENDARIO)
        navigate('/superadmin/appointments');
    }

    // 🔥 CALCULAR MONTO A MOSTRAR
    const getDisplayAmount = () => {
        if (selectedProcessType === "reserva") {
            return 0;
        }
        
        if (selectedPaymentType === "deposit" && canHaveDeposit) {
            return FIXED_DEPOSIT;
        }
        
        return appointment.totalAmount;
    }

    // 🔥 OBTENER TEXTO DEL TIPO DE PAGO
    const getPaymentTypeText = () => {
        if (selectedProcessType === "reserva") {
            return "Reserva directa";
        }
        
        if (selectedPaymentType === "deposit" && canHaveDeposit) {
            return "Abono";
        }
        
        return "Pago completo";
    }

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar />

            <main className="flex-1 overflow-y-auto">
                {/* Header */}
                <div className="border-b bg-white px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">Beaux</div>
                    </div>
                </div>

                {/* Content */}
                <div className="mx-auto max-w-5xl px-8 py-12">
                    <div className="mb-4">
                        <h1 className="mb-2 text-4xl font-normal tracking-tight">Confirma la cita</h1>
                        <p className="text-gray-600">
                            Revisa los datos de la reserva y elige cómo deseas proceder.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                            <div className="font-semibold">Error</div>
                            {error}
                            <button
                                onClick={() => setError(null)}
                                className="float-right text-red-600 hover:text-red-800"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    <div className="mt-8 space-y-6">
                        {/* Appointment Summary */}
                        <AppointmentSummary appointment={appointment} />

                        {/* 🔥 OPCIONES DE PROCESO */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h2 className="text-xl font-semibold mb-4">¿Cómo deseas proceder?</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setSelectedProcessType("reserva")}
                                    disabled={appointment.totalAmount <= FIXED_DEPOSIT}
                                    className={`p-4 rounded-xl border-2 transition-all ${
                                        selectedProcessType === "reserva" 
                                            ? 'border-green-500 bg-green-50 text-green-700' 
                                            : appointment.totalAmount <= FIXED_DEPOSIT
                                            ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="font-semibold">📅 Reservar sin pago</div>
                                    <div className="text-sm mt-1">Confirma la cita directamente</div>
                                    {appointment.totalAmount <= FIXED_DEPOSIT && (
                                        <div className="text-xs text-gray-500 mt-2">
                                            No disponible para servicios económicos
                                        </div>
                                    )}
                                </button>
                                
                                <button
                                    onClick={() => setSelectedProcessType("pago")}
                                    className={`p-4 rounded-xl border-2 transition-all ${
                                        selectedProcessType === "pago" 
                                            ? 'border-blue-500 bg-blue-50 text-blue-700' 
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="font-semibold">💰 Procesar pago</div>
                                    <div className="text-sm mt-1">
                                        {canHaveDeposit 
                                            ? "Solicitar abono o pago completo" 
                                            : "Pago completo del servicio"
                                        }
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* 🔥 OPCIONES DE PAGO (SOLO SI SE SELECCIONÓ PAGO) */}
                        {selectedProcessType === "pago" && (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <PaymentOptions
                                    selectedType={selectedPaymentType}
                                    onTypeChange={setSelectedPaymentType}
                                    depositAmount={FIXED_DEPOSIT.toString()}
                                    onDepositAmountChange={() => {}} // 🔥 No editable
                                    totalAmount={appointment.totalAmount}
                                    fixedDeposit={canHaveDeposit ? FIXED_DEPOSIT : undefined}
                                    canHaveDeposit={canHaveDeposit}
                                />

                                <PaymentMethodSelector
                                    selectedMethod={selectedPaymentMethod}
                                    onMethodChange={setSelectedPaymentMethod}
                                    amount={getDisplayAmount().toString()}
                                    paymentType={getPaymentTypeText()}
                                />
                            </div>
                        )}

                        {/* 🔥 RESUMEN DE ACCIÓN */}
                        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
                            <h3 className="font-semibold text-blue-900 mb-2">
                                {selectedProcessType === "reserva" 
                                    ? "📅 Reserva directa" 
                                    : selectedPaymentType === "deposit" && canHaveDeposit
                                        ? `💰 Abono de $${FIXED_DEPOSIT.toLocaleString()} COP`
                                        : `💰 Pago completo de $${appointment.totalAmount.toLocaleString()} COP`
                                }
                            </h3>
                            <p className="text-blue-700 text-sm">
                                {selectedProcessType === "reserva" 
                                    ? "La cita se confirmará directamente sin procesar ningún pago."
                                    : selectedPaymentType === "deposit" && canHaveDeposit
                                        ? `El cliente deberá abonar $${FIXED_DEPOSIT.toLocaleString()} COP para confirmar la cita.`
                                        : `El cliente deberá pagar el total de $${appointment.totalAmount.toLocaleString()} COP.`
                                }
                            </p>

                            {/* 🔥 NOTA INFORMATIVA PARA SERVICIOS ECONÓMICOS */}
                            {selectedProcessType === "pago" && !canHaveDeposit && appointment.totalAmount > 0 && (
                                <div className="mt-3 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                                    <p className="text-yellow-800 text-sm">
                                        💡 <strong>Nota:</strong> Este servicio tiene un valor de ${appointment.totalAmount.toLocaleString()} COP, 
                                        por lo que requiere <strong>pago completo</strong>. El abono de ${FIXED_DEPOSIT.toLocaleString()} COP 
                                        no aplica para servicios menores o iguales a ${FIXED_DEPOSIT.toLocaleString()} COP.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-4">
                            <Button 
                                variant="outline" 
                                size="lg" 
                                onClick={handleCancel}
                                disabled={loading}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="lg"
                                className="bg-[oklch(0.55_0.25_280)] hover:bg-[oklch(0.50_0.25_280)]"
                                onClick={handleConfirm}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                                        {selectedProcessType === "reserva" ? "Confirmando..." : "Procesando..."}
                                    </>
                                ) : (
                                    selectedProcessType === "reserva" ? "✅ Confirmar Reserva" : "💰 Confirmar Pago"
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}