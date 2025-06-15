const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no configurada en variables de entorno');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.3, // Más consistente para análisis
        topP: 0.8,
        maxOutputTokens: 2000 // Aumentado para análisis más complejos
      }
    });
  }
  
  // ✅ MÉTODOS EXISTENTES (mantener tal como están)
  async analyzeStoreFeedback(storeName, feedbacks) {
    const prompt = `
Eres un analista de retail experto. Analiza el feedback de la tienda "${storeName}":

COMENTARIOS RECIENTES:
${feedbacks.map((f, i) => `${i+1}. [${f.fecha}] ${f.colaborador}: "${f.comentario}" (Categoría: ${f.categoria}, Urgencia: ${f.urgencia})`).join('\n')}

INSTRUCCIONES:
- Identifica problemas recurrentes o urgentes que requieren acción inmediata
- Detecta tendencias preocupantes que puedan afectar el negocio
- Genera recomendaciones específicas y accionables
- Prioriza por impacto en ventas, seguridad y satisfacción del cliente

RESPONDE EXACTAMENTE EN ESTE FORMATO JSON (sin texto adicional):
{
  "alerts": ["problema urgente que requiere acción inmediata"],
  "insights": ["patrones o tendencias identificadas"],
  "recommendations": ["acciones específicas recomendadas"],
  "priority": "alta|media|baja",
  "summary": "resumen ejecutivo en máximo 50 palabras"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Limpiar respuesta para asegurar JSON válido
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Validar estructura
        if (!analysis.alerts || !analysis.insights || !analysis.recommendations || !analysis.priority) {
          throw new Error('Estructura de respuesta inválida');
        }
        
        return analysis;
      }
      
      throw new Error('No se pudo extraer JSON válido de la respuesta');
      
    } catch (error) {
      console.error('Error con Gemini:', error);
      
      // Fallback en caso de error
      return {
        alerts: ["Error en análisis automático - revisar manualmente"],
        insights: [`Análisis no disponible para ${feedbacks.length} comentario(s)`],
        recommendations: ["Revisar comentarios manualmente", "Verificar conectividad con sistema de análisis"],
        priority: "media",
        summary: "Análisis automático falló - requiere revisión manual"
      };
    }
  }
  
  async generateQuickInsight(singleFeedback) {
    const prompt = `
Analiza este feedback individual de tienda:

FEEDBACK: "${singleFeedback.comentario}"
CATEGORÍA: ${singleFeedback.categoria}
URGENCIA: ${singleFeedback.urgencia}
COLABORADOR: ${singleFeedback.colaborador}

Genera un insight rápido en máximo 100 caracteres sobre el problema y si requiere atención inmediata.

Responde solo el insight, sin formato adicional.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generando insight rápido:', error);
      return `Feedback sobre ${singleFeedback.categoria} - requiere revisión`;
    }
  }

  // 🚀 NUEVOS MÉTODOS AVANZADOS

  async generarAnalisisPrevisita(contexto) {
    const prompt = `
Eres un analista experto en retail. Genera recomendaciones PRE-VISITA para un colaborador.

DATOS DE LA TIENDA:
- Nombre: ${contexto.tienda.nombre}
- NPS: ${contexto.tienda.nps}
- Damage Rate: ${contexto.tienda.damage_rate}%
- Out of Stock: ${contexto.tienda.out_of_stock}%
- Última visita: ${contexto.tienda.ultima_visita || "Sin registro"}
- Horario: ${contexto.tienda.horario}

FEEDBACK HISTÓRICO (${contexto.feedback_historico.length} comentarios recientes):
${contexto.feedback_historico.slice(0, 10).map(f => 
  `- [${f.fecha}] ${f.categoria}: ${f.descripcion} (${f.urgencia})`
).join('\n')}

EVALUACIONES PREVIAS (${contexto.evaluaciones_previas.length} evaluaciones):
${contexto.evaluaciones_previas.slice(0, 5).map(e => {
  const limpieza = e.aspectos?.limpieza?.calificacion || 'N/A';
  const areas = e.areas_mejora?.slice(0, 3).join(', ') || 'Ninguna registrada';
  return `- Limpieza: ${limpieza}/5, Áreas mejora: ${areas}`;
}).join('\n')}

VISITAS RECIENTES (${contexto.visitas_recientes.length} visitas):
${contexto.visitas_recientes.slice(0, 3).map(v => 
  `- [${v.fecha_realizada}] Duración: ${v.duracion_minutos || 'N/A'} min, Notas: ${v.notas_finales || 'Sin notas'}`
).join('\n')}

TIPO DE VISITA: ${contexto.tipo_visita}

INSTRUCCIONES:
Basándote en el historial, genera recomendaciones específicas para la próxima visita. Enfócate en:
1. Problemas sin resolver que requieren verificación física
2. Puntos específicos a revisar en la tienda
3. Preguntas clave para hacer al tendero
4. Evidencias fotográficas importantes a capturar
5. Áreas de oportunidad detectadas en datos

RESPONDE EXACTAMENTE EN FORMATO JSON:
{
  "problemas_pendientes": ["problema específico a verificar"],
  "puntos_verificar": ["qué revisar físicamente en la tienda"],
  "preguntas_tendero": ["pregunta específica para el tendero"],
  "evidencias_capturar": ["tipo de foto/evidencia necesaria"],
  "areas_oportunidad": ["mejora potencial identificada"],
  "prioridad_visita": "alta|media|baja",
  "tiempo_estimado": "X-Y minutos",
  "preparacion_especial": "equipo o materiales especiales necesarios"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Validar estructura mínima
        if (!analysis.problemas_pendientes || !analysis.puntos_verificar) {
          throw new Error('Estructura de respuesta inválida');
        }
        
        return analysis;
      }
      
      throw new Error('No se pudo extraer JSON válido');
      
    } catch (error) {
      console.error('Error en análisis pre-visita:', error);
      return {
        problemas_pendientes: ["Error en análisis - revisar datos manualmente"],
        puntos_verificar: ["Inspección general de la tienda", "Verificar estado de equipos"],
        preguntas_tendero: ["¿Cómo ha estado el servicio últimamente?", "¿Hay algún problema que requiera atención?"],
        evidencias_capturar: ["Foto general de la tienda", "Estado de productos"],
        areas_oportunidad: ["Análisis manual requerido"],
        prioridad_visita: "media",
        tiempo_estimado: "30-45 minutos",
        preparacion_especial: "Ninguna especial"
      };
    }
  }

  async generarAnalisisPostvisita(contexto) {
    const prompt = `
Analiza los RESULTADOS de una visita completada a tienda.

DATOS DE LA VISITA:
- Duración: ${contexto.visita_actual.duracion_minutos || 'No registrada'} minutos
- Tipo: ${contexto.visita_actual.tipo}
- Notas finales: ${contexto.visita_actual.notas_finales || 'Sin notas'}

FEEDBACK CAPTURADO DEL TENDERO (${contexto.feedback_tendero.length} comentarios):
${contexto.feedback_tendero.map(f => 
  `- ${f.categoria}: ${f.descripcion} (Urgencia: ${f.urgencia})`
).join('\n')}

EVALUACIÓN DE LA TIENDA:
${contexto.evaluacion_tienda ? JSON.stringify(contexto.evaluacion_tienda.aspectos, null, 2) : 'No disponible'}

EVIDENCIAS SUBIDAS: ${contexto.evidencias.length} fotos/documentos

RECOMENDACIONES PRE-VISITA QUE SE DIERON:
${contexto.analisis_previsita ? JSON.stringify(contexto.analisis_previsita, null, 2) : 'No había análisis previo'}

VISITA ANTERIOR (para comparación):
${contexto.visita_anterior ? 
  `Fecha: ${contexto.visita_anterior.fecha_realizada}, Duración: ${contexto.visita_anterior.duracion_minutos} min` : 
  'Primera visita registrada'}

INSTRUCCIONES:
Compara la situación actual vs la anterior y evalúa el progreso. Analiza:
1. ¿Qué mejoras se implementaron desde la última visita?
2. ¿Qué problemas nuevos aparecieron?
3. ¿Qué tan efectivas fueron las recomendaciones previas?
4. ¿Qué seguimiento se requiere?
5. ¿Cuándo debería ser la próxima visita?

RESPONDE EN FORMATO JSON:
{
  "resumen_ejecutivo": "resumen en 2-3 líneas de la visita",
  "mejoras_implementadas": ["mejora confirmada desde visita anterior"],
  "nuevos_problemas": ["problema nuevo identificado en esta visita"],
  "seguimiento_requerido": ["acción específica de seguimiento"],
  "efectividad_recomendaciones": "alta|media|baja",
  "proximas_acciones": ["acción específica recomendada"],
  "nivel_seguimiento": "alto|medio|bajo",
  "fecha_proxima_visita": "fecha sugerida o período",
  "acciones_inmediatas": ["acción que requiere atención inmediata"]
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Validar estructura mínima
        if (!analysis.resumen_ejecutivo || !analysis.nivel_seguimiento) {
          throw new Error('Estructura de respuesta inválida');
        }
        
        return analysis;
      }
      
      throw new Error('No se pudo extraer JSON válido');
      
    } catch (error) {
      console.error('Error en análisis post-visita:', error);
      return {
        resumen_ejecutivo: "Visita completada - análisis automático falló, revisar datos manualmente",
        mejoras_implementadas: [],
        nuevos_problemas: ["Error en análisis automático"],
        seguimiento_requerido: ["Revisión manual de resultados de la visita"],
        efectividad_recomendaciones: "media",
        proximas_acciones: ["Programar siguiente visita", "Revisar datos manualmente"],
        nivel_seguimiento: "medio",
        fecha_proxima_visita: "En 30 días",
        acciones_inmediatas: []
      };
    }
  }

  async generarAnalisisTendencias(contexto) {
    const prompt = `
Analiza TENDENCIAS Y PATRONES en el sector retail basado en datos de ${contexto.periodo_analisis}.

DATOS ANALIZADOS:
- Período: ${contexto.periodo_analisis}
- Total feedback de tenderos: ${contexto.total_feedback}
- Total evaluaciones de tiendas: ${contexto.total_evaluaciones}

PROBLEMAS MÁS FRECUENTES:
${Object.entries(contexto.problemas_frecuentes)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .map(([problema, count]) => `- ${problema}: ${count} ocurrencias`)
  .join('\n')}

DISTRIBUCIÓN MENSUAL DE PROBLEMAS:
${Object.entries(contexto.patrones_mensuales)
  .map(([mes, count]) => `- Mes ${mes}: ${count} reportes`)
  .join('\n')}

INSTRUCCIONES:
Identifica patrones significativos y tendencias emergentes. Analiza:
1. ¿Qué problemas son estacionales vs permanentes?
2. ¿Qué tendencias emergentes ves en el sector?
3. ¿Qué oportunidades de mejora sistémica existen?
4. ¿Qué puedes predecir para los próximos 3 meses?

RESPONDE EN FORMATO JSON:
{
  "tendencias_principales": ["tendencia principal identificada"],
  "problemas_estacionales": {"mes_numero": "problema típico de ese mes"},
  "sectores_oportunidad": ["área de mejora que afecta múltiples tiendas"],
  "predicciones_3meses": ["predicción específica para próximos 3 meses"],
  "alertas_tempranas": ["señal de alerta que requiere atención"],
  "recomendaciones_estrategicas": ["recomendación de alto nivel para mejorar el sistema"]
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Validar estructura mínima
        if (!analysis.tendencias_principales) {
          throw new Error('Estructura de respuesta inválida');
        }
        
        return analysis;
      }
      
      throw new Error('No se pudo extraer JSON válido');
      
    } catch (error) {
      console.error('Error en análisis de tendencias:', error);
      return {
        tendencias_principales: ["Análisis en desarrollo - datos insuficientes"],
        problemas_estacionales: {},
        sectores_oportunidad: ["Mejora de procesos de visitas"],
        predicciones_3meses: ["Continuidad de operaciones normales"],
        alertas_tempranas: ["Verificar calidad de datos recopilados"],
        recomendaciones_estrategicas: ["Mantener monitoreo regular", "Incrementar frecuencia de visitas"]
      };
    }
  }

  async generarPredicciones(contexto) {
    const prompt = `
Genera PREDICCIONES para una tienda específica basándote en su historial.

TIENDA: ${contexto.tienda.nombre}
MÉTRICAS ACTUALES:
- NPS: ${contexto.metricas_actuales.nps}
- Damage Rate: ${contexto.metricas_actuales.damage_rate}%
- Out of Stock: ${contexto.metricas_actuales.out_of_stock}%

TENDENCIA EN FEEDBACK (últimos 6 meses):
${contexto.historial_feedback.slice(0, 15).map(f => 
  `[${f.fecha}] ${f.categoria}: ${f.urgencia}`
).join('\n')}

TENDENCIA EN EVALUACIONES:
${contexto.historial_evaluaciones.slice(0, 10).map(e => 
  `[${e.fecha}] Limpieza: ${e.aspectos?.limpieza?.calificacion || 'N/A'}/5`
).join('\n')}

INSTRUCCIONES:
Basándote en las tendencias históricas, predice:
1. ¿Qué problemas podrían surgir en los próximos 2-3 meses?
2. ¿Qué métricas podrían empeorar?
3. ¿Qué acciones preventivas se recomiendan?
4. ¿Con qué frecuencia debería visitarse esta tienda?

RESPONDE EN FORMATO JSON:
{
  "problemas_potenciales": ["problema que podría surgir"],
  "metricas_en_riesgo": ["métrica que podría empeorar"],
  "acciones_preventivas": ["acción específica para prevenir problemas"],
  "frecuencia_visitas_sugerida": "cada X días/semanas",
  "nivel_riesgo": "alto|medio|bajo",
  "indicadores_alerta": ["qué vigilar específicamente"],
  "recomendaciones_inmediatas": ["acción a tomar pronto"]
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Validar estructura mínima
        if (!analysis.nivel_riesgo) {
          throw new Error('Estructura de respuesta inválida');
        }
        
        return analysis;
      }
      
      throw new Error('No se pudo extraer JSON válido');
      
    } catch (error) {
      console.error('Error en predicciones:', error);
      return {
        problemas_potenciales: ["Análisis predictivo en desarrollo"],
        metricas_en_riesgo: ["Monitorear todas las métricas regularmente"],
        acciones_preventivas: ["Mantener programa de visitas regular"],
        frecuencia_visitas_sugerida: "cada 30 días",
        nivel_riesgo: "medio",
        indicadores_alerta: ["Cambios significativos en NPS o inventario"],
        recomendaciones_inmediatas: ["Continuar monitoreo regular"]
      };
    }
  }
}

module.exports = { GeminiService };