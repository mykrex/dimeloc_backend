// services/geminiService.js
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
        maxOutputTokens: 1000
      }
    });
  }
  
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
}

module.exports = { GeminiService };