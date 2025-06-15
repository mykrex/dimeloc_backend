// server.js - API para datos GeoJSON de tiendas OXXO
const { GeminiService } = require('./services/geminiService');

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Variables de MongoDB - AJUSTADAS PARA TUS DATOS
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = "dimeloc_data";      // Tu base de datos
const COLLECTION_NAME = "puntos_venta";    // Tu colección

let db;

// Conectar a MongoDB
MongoClient.connect(MONGODB_URI)
  .then(client => {
    console.log('✅ Conectado a MongoDB Atlas');
    db = client.db(DATABASE_NAME);
  })
  .catch(error => {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  });

// FUNCIÓN HELPER: Extraer tiendas del GeoJSON
async function obtenerTiendasDesdeGeoJSON() {
  try {
    // Obtener el documento GeoJSON completo
    const geoJsonDoc = await db.collection(COLLECTION_NAME).findOne({});
    
    if (!geoJsonDoc || !geoJsonDoc.features) {
      throw new Error('No se encontraron datos de tiendas');
    }
    
    // Transformar cada feature en una tienda
    const tiendas = geoJsonDoc.features.map((feature, index) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      
      return {
        _id: parseInt(props.col0) || index,  // Usar col0 como ID o el índice
        nombre: props.nombre,
        location: {
          longitude: coords[0],
          latitude: coords[1]
        },
        nps: parseFloat(props.nps) || 0,
        fillfoundrate: parseFloat(props.fillfoundrate) || 0,
        damage_rate: parseFloat(props.damage_rate) || 0,
        out_of_stock: parseFloat(props.out_of_stock) || 0,
        complaint_resolution_time_hrs: parseFloat(props.complaint_resolution_time_hrs) || 0
      };
    });
    
    return tiendas;
  } catch (error) {
    console.error('Error extrayendo tiendas:', error);
    throw error;
  }
}

// ENDPOINTS

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Obtener todas las tiendas
app.get('/api/tiendas', async (req, res) => {
  try {
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    res.json({
      success: true,
      count: tiendas.length,
      data: tiendas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// RUTAS ESPECÍFICAS PRIMERO (antes de /:id)

// Tiendas problemáticas
app.get('/api/tiendas/problematicas', async (req, res) => {
  try {
    const todasLasTiendas = await obtenerTiendasDesdeGeoJSON();
    const tiendas = todasLasTiendas.filter(tienda => 
      tienda.nps < 30 || 
      tienda.out_of_stock > 4 || 
      tienda.damage_rate > 1 || 
      tienda.complaint_resolution_time_hrs > 48
    );
    
    res.json({
      success: true,
      count: tiendas.length,
      criteria: "NPS < 30 OR desabasto > 4% OR daños > 1% OR quejas > 48hrs",
      data: tiendas.sort((a, b) => a.nps - b.nps) // Ordenar por NPS ascendente (peores primero)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Filtrar por NPS mínimo
app.get('/api/tiendas/nps/:minimo', async (req, res) => {
  try {
    const npsMinimo = parseFloat(req.params.minimo);
    const todasLasTiendas = await obtenerTiendasDesdeGeoJSON();
    const tiendas = todasLasTiendas.filter(t => t.nps >= npsMinimo);
    
    res.json({
      success: true,
      count: tiendas.length,
      filter: `NPS >= ${npsMinimo}`,
      data: tiendas.sort((a, b) => b.nps - a.nps) // Ordenar por NPS descendente
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Buscar tiendas cerca de una ubicación
app.get('/api/tiendas/cerca/:lat/:lng/:radio', async (req, res) => {
  try {
    const lat = parseFloat(req.params.lat);
    const lng = parseFloat(req.params.lng);
    const radio = parseFloat(req.params.radio) || 5; // km por defecto
    
    const todasLasTiendas = await obtenerTiendasDesdeGeoJSON();
    
    // Filtro simple por coordenadas (aproximado)
    const radioGrados = radio / 111; // Conversión aproximada
    const tiendas = todasLasTiendas.filter(tienda => {
      const deltaLat = Math.abs(tienda.location.latitude - lat);
      const deltaLng = Math.abs(tienda.location.longitude - lng);
      return deltaLat <= radioGrados && deltaLng <= radioGrados;
    });
    
    res.json({
      success: true,
      count: tiendas.length,
      center: { lat, lng },
      radio_km: radio,
      data: tiendas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// RUTA GENÉRICA AL FINAL (después de todas las específicas)

// Obtener tienda específica por ID
app.get('/api/tiendas/:id', async (req, res) => {
  try {
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    const tienda = tiendas.find(t => t._id === parseInt(req.params.id));
    
    if (!tienda) {
      return res.status(404).json({
        success: false,
        message: 'Tienda no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: tienda
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Estadísticas generales
app.get('/api/stats', async (req, res) => {
  try {
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    
    const stats = {
      total_tiendas: tiendas.length,
      nps_promedio: tiendas.reduce((sum, t) => sum + t.nps, 0) / tiendas.length,
      nps_maximo: Math.max(...tiendas.map(t => t.nps)),
      nps_minimo: Math.min(...tiendas.map(t => t.nps)),
      damage_rate_promedio: tiendas.reduce((sum, t) => sum + t.damage_rate, 0) / tiendas.length,
      out_of_stock_promedio: tiendas.reduce((sum, t) => sum + t.out_of_stock, 0) / tiendas.length,
      tiempo_quejas_promedio: tiendas.reduce((sum, t) => sum + t.complaint_resolution_time_hrs, 0) / tiendas.length,
      tiendas_problematicas: tiendas.filter(t => 
        t.nps < 30 || t.out_of_stock > 4 || t.damage_rate > 1
      ).length
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener datos GeoJSON originales (útil para mapas)
app.get('/api/geojson', async (req, res) => {
  try {
    const geoJsonDoc = await db.collection(COLLECTION_NAME).findOne({});
    if (!geoJsonDoc) {
      return res.status(404).json({
        success: false,
        message: 'Datos GeoJSON no encontrados'
      });
    }
    
    res.json({
      success: true,
      data: geoJsonDoc
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Agregar feedback
app.post('/api/tiendas/:id/feedback', async (req, res) => {
  try {
    const { colaborador, comentario, categoria, urgencia } = req.body;
    const tiendaId = parseInt(req.params.id);
    
    // Validaciones básicas
    if (!colaborador || !comentario || !categoria || !urgencia) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: colaborador, comentario, categoria, urgencia'
      });
    }
    
    // Crear documento de feedback
    const feedback = {
      tienda_id: tiendaId,
      colaborador: colaborador.trim(),
      fecha: new Date().toISOString(),
      comentario: comentario.trim(),
      categoria,
      urgencia,
      resuelto: false
    };
    
    // Guardar feedback en MongoDB
    const result = await db.collection('feedback_tiendas').insertOne(feedback);
    console.log(`✅ Feedback guardado con ID: ${result.insertedId}`);
    
    // Obtener feedback reciente de esta tienda para análisis
    const recentFeedback = await db.collection('feedback_tiendas')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(10)
      .toArray();
    
    console.log(`📊 Analizando ${recentFeedback.length} comentarios para tienda ${tiendaId}`);
    
    // Analizar con Gemini si hay suficiente feedback
    let geminiAnalysis = null;
    let analysisInfo = {
      generated: false,
      reason: 'Insuficiente feedback para análisis'
    };
    
    if (recentFeedback.length >= 1) {
      try {
        const geminiService = new GeminiService();
        
        // Obtener nombre de la tienda
        const tiendas = await obtenerTiendasDesdeGeoJSON();
        const tienda = tiendas.find(t => t._id === tiendaId);
        const tiendaNombre = tienda ? tienda.nombre : `Tienda ${tiendaId}`;
        
        geminiAnalysis = await geminiService.analyzeStoreFeedback(
          tiendaNombre, 
          recentFeedback
        );
        
        if (geminiAnalysis) {
          // Guardar insights en MongoDB
          const insightDoc = {
            tienda_id: tiendaId,
            fecha_analisis: new Date().toISOString(),
            alertas: geminiAnalysis.alerts,
            insights: geminiAnalysis.insights,
            recomendaciones: geminiAnalysis.recommendations,
            prioridad: geminiAnalysis.priority,
            resumen: geminiAnalysis.summary,
            feedback_analizado: recentFeedback.map(f => f._id),
            total_comentarios: recentFeedback.length
          };
          
          const insightResult = await db.collection('insights_gemini').insertOne(insightDoc);
          console.log(`🤖 Insight generado con ID: ${insightResult.insertedId}`);
          
          // Actualizar info de análisis
          analysisInfo = {
            generated: true,
            priority: geminiAnalysis.priority,
            summary: geminiAnalysis.summary
          };
        }
      } catch (error) {
        console.error('❌ Error con Gemini:', error.message);
        analysisInfo = {
          generated: false,
          reason: `Error en análisis: ${error.message}`
        };
      }
    }
    
    // ✅ RESPUESTA CORREGIDA para coincidir con Swift
    res.json({
      success: true,
      message: 'Feedback enviado correctamente',
      feedback: {
        _id: result.insertedId.toString(),
        tienda_id: tiendaId,
        colaborador: feedback.colaborador,
        fecha: feedback.fecha,
        comentario: feedback.comentario,
        categoria: feedback.categoria,
        urgencia: feedback.urgencia,
        resuelto: feedback.resuelto
      },
      analysis: analysisInfo
    });
    
  } catch (error) {
    console.error('❌ Error guardando feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener feedback de una tienda
app.get('/api/tiendas/:id/feedback', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.id);
    const feedback = await db.collection('feedback_tiendas')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .toArray();
    
    res.json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener insights de Gemini
app.get('/api/tiendas/:id/insights', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.id);
    const insights = await db.collection('insights_gemini')
      .find({ tienda_id: tiendaId })
      .sort({ fecha_analisis: -1 })
      .limit(5)
      .toArray();
    
    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analizar todas las tiendas (para reportes)
app.post('/api/insights/analyze-all', async (req, res) => {
  try {
    const geminiService = new GeminiService();
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    const results = [];
    
    for (const tienda of tiendas) {
      const feedback = await db.collection('feedback_tiendas')
        .find({ tienda_id: tienda._id })
        .sort({ fecha: -1 })
        .limit(10)
        .toArray();
      
      if (feedback.length > 0) {
        const insights = await geminiService.analyzeStoreFeedback(
          tienda.nombre, 
          feedback
        );
        
        if (insights && insights.priority === 'alta') {
          results.push({
            tienda: tienda.nombre,
            tienda_id: tienda._id,
            ...insights
          });
        }
      }
    }
    
    res.json({ success: true, urgent_stores: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// TEST GEMINI
app.post('/api/test-gemini', async (req, res) => {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY no configurada'
      });
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = "Analiza este feedback de tienda: 'El refrigerador no funciona desde hace 2 semanas y los productos lácteos están dañándose'";
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({
      success: true,
      prompt: prompt,
      analysis: response.text()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 1. ENDPOINT: Agregar feedback
app.post('/api/tiendas/:id/feedback', async (req, res) => {
  try {
    const { colaborador, comentario, categoria, urgencia } = req.body;
    const tiendaId = parseInt(req.params.id);
    
    // Validaciones básicas
    if (!colaborador || !comentario || !categoria || !urgencia) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: colaborador, comentario, categoria, urgencia'
      });
    }
    
    // Crear documento de feedback
    const feedback = {
      tienda_id: tiendaId,
      colaborador: colaborador.trim(),
      fecha: new Date().toISOString(),
      comentario: comentario.trim(),
      categoria,
      urgencia,
      resuelto: false
    };
    
    // Guardar feedback en MongoDB
    const result = await db.collection('feedback_tiendas').insertOne(feedback);
    console.log(`✅ Feedback guardado con ID: ${result.insertedId}`);
    
    // Obtener feedback reciente de esta tienda para análisis
    const recentFeedback = await db.collection('feedback_tiendas')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(10)
      .toArray();
    
    console.log(`📊 Analizando ${recentFeedback.length} comentarios para tienda ${tiendaId}`);
    
    // Analizar con Gemini si hay suficiente feedback
    let geminiAnalysis = null;
    if (recentFeedback.length >= 1) { // Analizar desde el primer comentario
      try {
        const geminiService = new GeminiService();
        
        // Obtener nombre de la tienda
        const tiendas = await obtenerTiendasDesdeGeoJSON();
        const tienda = tiendas.find(t => t._id === tiendaId);
        const tiendaNombre = tienda ? tienda.nombre : `Tienda ${tiendaId}`;
        
        geminiAnalysis = await geminiService.analyzeStoreFeedback(
          tiendaNombre, 
          recentFeedback
        );
        
        // Guardar insights en MongoDB
        if (geminiAnalysis) {
          const insightDoc = {
            tienda_id: tiendaId,
            fecha_analisis: new Date().toISOString(),
            alertas: geminiAnalysis.alerts,
            insights: geminiAnalysis.insights,
            recomendaciones: geminiAnalysis.recommendations,
            prioridad: geminiAnalysis.priority,
            resumen: geminiAnalysis.summary,
            feedback_analizado: recentFeedback.map(f => f._id),
            total_comentarios: recentFeedback.length
          };
          
          const insightResult = await db.collection('insights_gemini').insertOne(insightDoc);
          console.log(`🤖 Insight generado con ID: ${insightResult.insertedId}`);
        }
      } catch (error) {
        console.error('❌ Error con Gemini:', error.message);
        // Continuar aunque falle Gemini
      }
    }
    
    res.json({
      success: true,
      message: 'Feedback enviado correctamente',
      feedback: {
        id: result.insertedId,
        tienda_id: tiendaId,
        fecha: feedback.fecha
      },
      analysis: geminiAnalysis ? {
        generated: true,
        priority: geminiAnalysis.priority,
        summary: geminiAnalysis.summary
      } : {
        generated: false,
        reason: 'Insuficiente feedback para análisis'
      }
    });
    
  } catch (error) {
    console.error('❌ Error guardando feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 2. ENDPOINT: Obtener feedback de una tienda
app.get('/api/tiendas/:id/feedback', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.id);
    
    const feedback = await db.collection('feedback_tiendas')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .toArray();
    
    res.json({
      success: true,
      count: feedback.length,
      data: feedback
    });
  } catch (error) {
    console.error('❌ Error obteniendo feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. ENDPOINT: Obtener insights de Gemini para una tienda
app.get('/api/tiendas/:id/insights', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.id);
    
    const insights = await db.collection('insights_gemini')
      .find({ tienda_id: tiendaId })
      .sort({ fecha_analisis: -1 })
      .limit(5)
      .toArray();
    
    res.json({
      success: true,
      count: insights.length,
      data: insights
    });
  } catch (error) {
    console.error('❌ Error obteniendo insights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. ENDPOINT: Obtener resumen de todas las tiendas problemáticas
app.get('/api/insights/problematicas', async (req, res) => {
  try {
    // Obtener insights de prioridad alta de los últimos 7 días
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const problematicInsights = await db.collection('insights_gemini')
      .find({
        prioridad: 'alta',
        fecha_analisis: { $gte: sevenDaysAgo.toISOString() }
      })
      .sort({ fecha_analisis: -1 })
      .toArray();
    
    // Obtener información de las tiendas
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    
    const result = problematicInsights.map(insight => {
      const tienda = tiendas.find(t => t._id === insight.tienda_id);
      return {
        tienda_id: insight.tienda_id,
        tienda_nombre: tienda ? tienda.nombre : `Tienda ${insight.tienda_id}`,
        alertas: insight.alertas,
        resumen: insight.resumen,
        fecha_analisis: insight.fecha_analisis,
        total_comentarios: insight.total_comentarios
      };
    });
    
    res.json({
      success: true,
      count: result.length,
      data: result,
      message: `${result.length} tiendas con alertas de prioridad alta en los últimos 7 días`
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo tiendas problemáticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. ENDPOINT: Analizar tienda específica manualmente
app.post('/api/tiendas/:id/analyze', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.id);
    
    // Obtener feedback reciente
    const recentFeedback = await db.collection('feedback_tiendas')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(15)
      .toArray();
    
    if (recentFeedback.length === 0) {
      return res.json({
        success: false,
        message: 'No hay feedback disponible para analizar'
      });
    }
    
    // Obtener nombre de la tienda
    const tiendas = await obtenerTiendasDesdeGeoJSON();
    const tienda = tiendas.find(t => t._id === tiendaId);
    const tiendaNombre = tienda ? tienda.nombre : `Tienda ${tiendaId}`;
    
    // Analizar con Gemini
    const geminiService = new GeminiService();
    const analysis = await geminiService.analyzeStoreFeedback(tiendaNombre, recentFeedback);
    
    // Guardar nuevo insight
    const insightDoc = {
      tienda_id: tiendaId,
      fecha_analisis: new Date().toISOString(),
      alertas: analysis.alerts,
      insights: analysis.insights,
      recomendaciones: analysis.recommendations,
      prioridad: analysis.priority,
      resumen: analysis.summary,
      feedback_analizado: recentFeedback.map(f => f._id),
      total_comentarios: recentFeedback.length,
      analisis_manual: true
    };
    
    await db.collection('insights_gemini').insertOne(insightDoc);
    
    res.json({
      success: true,
      message: 'Análisis completado',
      analysis: analysis,
      feedback_count: recentFeedback.length
    });
    
  } catch (error) {
    console.error('❌ Error en análisis manual:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Todas las tiendas: http://localhost:${PORT}/api/tiendas`);
  console.log(`📈 Estadísticas: http://localhost:${PORT}/api/stats`);
  console.log(`🗺️  GeoJSON original: http://localhost:${PORT}/api/geojson`);
});