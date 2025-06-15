// services/geminiService.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class GeminiService {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }
  
  async analyzeStoreFeedback(storeName, feedbacks) {
    const prompt = `
    Analiza el feedback de la tienda "${storeName}":
    
    Comentarios recientes:
    ${feedbacks.map(f => `- ${f.comment} (${f.date})`).join('\n')}
    
    Genera insights importantes como:
    - Problemas recurrentes
    - Alertas urgentes
    - Recomendaciones de acción
    - Tendencias preocupantes
    
    Responde en JSON con esta estructura:
    {
      "alerts": ["problema urgente 1", "problema urgente 2"],
      "insights": ["insight 1", "insight 2"],
      "recommendations": ["acción 1", "acción 2"],
      "priority": "alta|media|baja"
    }
    `;
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text());
    } catch (error) {
      console.error('Error con Gemini:', error);
      return null;
    }
  }
}