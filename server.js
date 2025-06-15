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

// ===============================
// 🔐 AUTENTICACIÓN CON JWT
// ===============================

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dimeloc_fallback_secret_key';
const JWT_EXPIRES_IN = '7d';

// Middleware para verificar token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acceso requerido'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido'
      });
    }
    req.user = user;
    next();
  });
};

// POST /api/auth/login - LOGIN CON JWT
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Intento de login:', req.body.email);
    
    const { email, password } = req.body;
    
    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario por email (case insensitive)
    const usuario = await db.collection('usuarios').findOne({
      email: email.toLowerCase().trim()
    });

    if (!usuario) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({
        success: false,
        message: 'Correo o contraseña incorrectos'
      });
    }

    // Verificar si el usuario está activo
    if (!usuario.activo) {
      console.log('❌ Usuario inactivo:', email);
      return res.status(403).json({
        success: false,
        message: 'Usuario inactivo. Contacta al administrador'
      });
    }

    // Verificar contraseña (texto plano por ahora)
    const isValidPassword = password === usuario.password;

    if (!isValidPassword) {
      console.log('❌ Contraseña incorrecta para:', email);
      return res.status(401).json({
        success: false,
        message: 'Correo o contraseña incorrectos'
      });
    }

    // Crear token JWT
    const tokenPayload = {
      userId: usuario._id.toString(),
      email: usuario.email,
      rol: usuario.rol
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Preparar datos del usuario (sin contraseña)
    const userData = {
      _id: usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      telefono: usuario.telefono,
      activo: usuario.activo,
      fecha_registro: usuario.fecha_registro
    };

    console.log('✅ Login exitoso:', usuario.nombre);

    res.json({
      success: true,
      message: 'Login exitoso',
      data: userData,
      token: token
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/auth/validate - Validar token
app.get('/api/auth/validate', authenticateToken, async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    
    // Buscar usuario por ID del token
    const usuario = await db.collection('usuarios').findOne({
      _id: new ObjectId(req.user.userId)
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no válido'
      });
    }

    // Preparar datos del usuario (sin contraseña)
    const userData = {
      _id: usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      telefono: usuario.telefono,
      activo: usuario.activo,
      fecha_registro: usuario.fecha_registro
    };

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('❌ Error validating token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// OBTENER TODOS LOS COLABORADORES
app.get('/api/usuarios/colaboradores', async (req, res) => {
  try {
    const colaboradores = await db.collection('usuarios')
      .find({ 
        rol: { $in: ['colaborador', 'asesor'] },
        activo: true 
      })
      .project({ password: 0 })
      .toArray();
    
    res.json({ success: true, data: colaboradores });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// OBTENER PERFIL DEL USUARIO
app.get('/api/auth/profile/:userId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const userId = req.params.userId;
    
    const usuario = await db.collection('usuarios').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } } // No devolver la contraseña
    );
    
    if (usuario) {
      res.json({ 
        success: true, 
        user: usuario 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Usuario no encontrado' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ENDPOINT MEJORADO PARA TIENDAS CON ESTADO
app.get('/api/tiendas-completas', async (req, res) => {
  try {
    // Obtener GeoJSON original
    const geoJsonDoc = await db.collection('puntos_venta').findOne({});
    
    if (!geoJsonDoc) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron datos de tiendas'
      });
    }
    
    // Calcular estado actual para cada tienda
    const ahora = new Date();
    const inicioJunio = new Date('2025-06-01');
    
    const tiendasEnriquecidas = geoJsonDoc.features.map((feature) => {
      const props = feature.properties;
      
      // Calcular días sin visita
      let diasSinVisita = 0;
      let estadoVisita = 'al_dia';
      
      if (props.fecha_ultima_visita) {
        const fechaVisita = new Date(props.fecha_ultima_visita);
        diasSinVisita = Math.floor((ahora - fechaVisita) / (1000 * 60 * 60 * 24));
        
        if (diasSinVisita <= 7) estadoVisita = 'reciente';
        else if (diasSinVisita <= 15) estadoVisita = 'normal';
        else if (diasSinVisita <= 25) estadoVisita = 'pendiente';
        else estadoVisita = 'urgente';
      } else {
        diasSinVisita = 30;
        estadoVisita = 'urgente';
      }
      
      // Verificar si está abierta ahora
      const horaActual = ahora.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Mexico_City'
      });
      
      const estaAbierta = props.hora_abre === "24hrs" ? true : 
        (horaActual >= props.hora_abre && horaActual <= props.hora_cierra);
      
      // Color del marcador según estado
      const colorMarker = estadoVisita === 'urgente' ? '#FF4444' :
                         estadoVisita === 'pendiente' ? '#FF8800' :
                         estadoVisita === 'normal' ? '#44AA44' : '#00AA00';
      
      return {
        ...feature,
        properties: {
          ...props,
          
          // CAMPOS CALCULADOS DINÁMICAMENTE:
          dias_sin_visita: diasSinVisita,
          estado_visita: estadoVisita,
          esta_abierta: estaAbierta,
          color_marker: colorMarker,
          necesita_visita: estadoVisita === 'urgente' || estadoVisita === 'pendiente',
          
          // Info para popup del mapa
          popup_info: {
            titulo: props.nombre,
            subtitulo: estaAbierta ? '🟢 Abierto' : '🔴 Cerrado',
            horario: props.hora_abre === '24hrs' ? '24 horas' : `${props.hora_abre} - ${props.hora_cierra}`,
            colaborador: props.colaborador_asignado?.split('@')[0] || 'Sin asignar',
            ultima_visita: props.fecha_ultima_visita ? 
              `Hace ${diasSinVisita} días` : 'Sin visitas',
            estado: estadoVisita === 'urgente' ? '⚠️ Visita urgente' :
                   estadoVisita === 'pendiente' ? '📅 Visita pendiente' :
                   '✅ Al día',
            nps: `NPS: ${props.nps}`
          }
        }
      };
    });
    
    // Estadísticas del resumen
    const resumen = {
      total: tiendasEnriquecidas.length,
      abiertas_ahora: tiendasEnriquecidas.filter(t => t.properties.esta_abierta).length,
      visitadas_junio: tiendasEnriquecidas.filter(t => t.properties.estado_junio === 'visitada').length,
      pendientes_junio: tiendasEnriquecidas.filter(t => t.properties.estado_junio === 'pendiente').length,
      urgentes: tiendasEnriquecidas.filter(t => t.properties.estado_visita === 'urgente').length
    };
    
    res.json({
      success: true,
      resumen,
      data: {
        type: "FeatureCollection",
        features: tiendasEnriquecidas
      }
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo tiendas:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// OBTENER AGENDA DEL USUARIO
app.get('/api/agenda/:userId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const userId = req.params.userId;
    const { desde, hasta } = req.query;
    
    // Fechas por defecto: próximos 30 días
    const fechaDesde = desde ? new Date(desde) : new Date();
    const fechaHasta = hasta ? new Date(hasta) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const visitas = await db.collection('visitas')
      .find({ 
        $or: [
          { colaborador_id: new ObjectId(userId) },
          { asesor_id: new ObjectId(userId) }
        ],
        fecha_programada: { 
          $gte: fechaDesde.toISOString(),
          $lte: fechaHasta.toISOString()
        }
      })
      .sort({ fecha_programada: 1 })
      .toArray();
    
    // Enriquecer con datos de tienda
    const visitasConTienda = await Promise.all(
      visitas.map(async (visita) => {
        const geoJsonDoc = await db.collection('puntos_venta').findOne({});
        const tienda = geoJsonDoc.features.find(f => 
          parseInt(f.properties.col0) === parseInt(visita.tienda_id)
        );
        
        return {
          ...visita,
          tienda: tienda ? {
            id: tienda.properties.col0,
            nombre: tienda.properties.nombre,
            direccion: tienda.properties.direccion,
            horario: `${tienda.properties.hora_abre} - ${tienda.properties.hora_cierra}`
          } : null
        };
      })
    );
    
    res.json({ 
      success: true, 
      count: visitasConTienda.length,
      data: visitasConTienda 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PROGRAMAR NUEVA VISITA
app.post('/api/visitas/programar', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { 
      tienda_id, 
      colaborador_id, 
      asesor_id, 
      fecha_programada, 
      tipo = "regular",
      notas = ""
    } = req.body;
    
    // Validar que la tienda existe
    const geoJsonDoc = await db.collection('puntos_venta').findOne({});
    const tiendaExiste = geoJsonDoc.features.some(f => 
      parseInt(f.properties.col0) === parseInt(tienda_id)
    );
    
    if (!tiendaExiste) {
      return res.status(404).json({
        success: false,
        error: 'Tienda no encontrada'
      });
    }
    
    // Verificar que no hay otra visita programada el mismo día
    const fechaVisita = new Date(fecha_programada);
    const inicioDia = new Date(fechaVisita);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaVisita);
    finDia.setHours(23, 59, 59, 999);
    
    const visitaExistente = await db.collection('visitas').findOne({
      tienda_id: parseInt(tienda_id),
      fecha_programada: {
        $gte: inicioDia.toISOString(),
        $lte: finDia.toISOString()
      },
      estado: { $ne: 'cancelada' }
    });
    
    if (visitaExistente) {
      return res.status(400).json({
        success: false,
        error: 'Ya hay una visita programada para esta tienda en esta fecha'
      });
    }
    
    const nuevaVisita = {
      tienda_id: parseInt(tienda_id),
      colaborador_id: new ObjectId(colaborador_id),
      asesor_id: asesor_id ? new ObjectId(asesor_id) : null,
      fecha_programada: new Date(fecha_programada).toISOString(),
      fecha_realizada: null,
      estado: "programada",
      tipo,
      confirmaciones: {
        colaborador: { confirmado: false, fecha_confirmacion: null },
        asesor: asesor_id ? { confirmado: false, fecha_confirmacion: null } : null
      },
      duracion_minutos: null,
      notas_previas: notas,
      completada: false,
      fecha_creacion: new Date().toISOString()
    };
    
    const result = await db.collection('visitas').insertOne(nuevaVisita);
    
    res.json({
      success: true,
      message: 'Visita programada correctamente',
      visita: {
        id: result.insertedId,
        ...nuevaVisita
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CONFIRMAR ASISTENCIA A VISITA
app.put('/api/visitas/:id/confirmar', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const visitaId = req.params.id;
    const { usuario_id, rol } = req.body;
    
    const updateField = rol === 'asesor' 
      ? 'confirmaciones.asesor' 
      : 'confirmaciones.colaborador';
    
    const update = {
      [`${updateField}.confirmado`]: true,
      [`${updateField}.fecha_confirmacion`]: new Date().toISOString()
    };
    
    const result = await db.collection('visitas').updateOne(
      { _id: new ObjectId(visitaId) },
      { $set: update }
    );
    
    if (result.modifiedCount > 0) {
      // Verificar si todos confirmaron
      const visita = await db.collection('visitas').findOne({
        _id: new ObjectId(visitaId)
      });
      
      const colaboradorConfirmado = visita.confirmaciones.colaborador.confirmado;
      const asesorConfirmado = !visita.asesor_id || 
        (visita.confirmaciones.asesor && visita.confirmaciones.asesor.confirmado);
      
      if (colaboradorConfirmado && asesorConfirmado) {
        await db.collection('visitas').updateOne(
          { _id: new ObjectId(visitaId) },
          { $set: { estado: "confirmada" } }
        );
      }
      
      res.json({ 
        success: true, 
        message: 'Confirmación registrada',
        todos_confirmaron: colaboradorConfirmado && asesorConfirmado
      });
    } else {
      res.status(404).json({ success: false, error: 'Visita no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// INICIAR VISITA (cuando llegan a la tienda)
app.post('/api/visitas/:id/iniciar', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const visitaId = req.params.id;
    const { ubicacion_llegada } = req.body;
    
    const update = {
      estado: "en_curso",
      fecha_inicio_real: new Date().toISOString(),
      ubicacion_llegada: ubicacion_llegada || null
    };
    
    const result = await db.collection('visitas').updateOne(
      { _id: new ObjectId(visitaId) },
      { $set: update }
    );
    
    if (result.modifiedCount > 0) {
      res.json({ success: true, message: 'Visita iniciada' });
    } else {
      res.status(404).json({ success: false, error: 'Visita no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FINALIZAR VISITA
app.post('/api/visitas/:id/finalizar', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const visitaId = req.params.id;
    const { duracion_minutos, notas_finales } = req.body;
    
    const ahora = new Date().toISOString();
    
    const update = {
      estado: "completada",
      completada: true,
      fecha_realizada: ahora,
      fecha_finalizacion: ahora,
      duracion_minutos: duracion_minutos || null,
      notas_finales: notas_finales || ""
    };
    
    const result = await db.collection('visitas').updateOne(
      { _id: new ObjectId(visitaId) },
      { $set: update }
    );
    
    if (result.modifiedCount > 0) {
      // Actualizar fecha_ultima_visita en puntos_venta
      const visita = await db.collection('visitas').findOne({
        _id: new ObjectId(visitaId)
      });
      
      if (visita) {
        await db.collection('puntos_venta').updateOne(
          { "features.properties.col0": visita.tienda_id.toString() },
          { 
            $set: { 
              "features.$.properties.fecha_ultima_visita": ahora,
              "features.$.properties.estado_junio": "visitada"
            }
          }
        );
      }
      
      res.json({ success: true, message: 'Visita finalizada correctamente' });
    } else {
      res.status(404).json({ success: false, error: 'Visita no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generar recomendaciones antes de la visita
app.post('/api/gemini/previsita/:tiendaId', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.tiendaId);
    const { colaborador_id, tipo_visita = "regular" } = req.body;
    
    // Obtener datos de la tienda
    const geoJsonDoc = await db.collection('puntos_venta').findOne({});
    const tienda = geoJsonDoc.features.find(f => 
      parseInt(f.properties.col0) === tiendaId
    );
    
    if (!tienda) {
      return res.status(404).json({ success: false, error: 'Tienda no encontrada' });
    }
    
    // Obtener historial de feedback del tendero (últimos 6 meses)
    const seiseMesesAtras = new Date();
    seiseMesesAtras.setMonth(seiseMesesAtras.getMonth() - 6);
    
    const feedbackHistorico = await db.collection('feedback_tendero')
      .find({ 
        tienda_id: tiendaId,
        fecha: { $gte: seiseMesesAtras.toISOString() }
      })
      .sort({ fecha: -1 })
      .limit(20)
      .toArray();
    
    // Obtener evaluaciones previas de la tienda
    const evaluacionesPrevias = await db.collection('feedback_tienda')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(10)
      .toArray();
    
    // Obtener visitas recientes
    const visitasRecientes = await db.collection('visitas')
      .find({ 
        tienda_id: tiendaId,
        completada: true 
      })
      .sort({ fecha_realizada: -1 })
      .limit(5)
      .toArray();
    
    // Preparar contexto para Gemini
    const contextoAnalisis = {
      tienda: {
        nombre: tienda.properties.nombre,
        nps: tienda.properties.nps,
        damage_rate: tienda.properties.damage_rate,
        out_of_stock: tienda.properties.out_of_stock,
        ultima_visita: tienda.properties.fecha_ultima_visita,
        horario: `${tienda.properties.hora_abre} - ${tienda.properties.hora_cierra}`
      },
      feedback_historico: feedbackHistorico,
      evaluaciones_previas: evaluacionesPrevias,
      visitas_recientes: visitasRecientes,
      tipo_visita
    };
    
    // Generar análisis con Gemini
    const geminiService = new GeminiService();
    const analisisPrevisita = await geminiService.generarAnalisisPrevisita(contextoAnalisis);
    
    // Guardar análisis en BD
    const documentoAnalisis = {
      tienda_id: tiendaId,
      colaborador_id: colaborador_id,
      tipo_analisis: "previsita",
      fecha_analisis: new Date().toISOString(),
      contexto_analizado: {
        feedback_count: feedbackHistorico.length,
        evaluaciones_count: evaluacionesPrevias.length,
        visitas_count: visitasRecientes.length
      },
      recomendaciones: analisisPrevisita,
      utilizado: false
    };
    
    const result = await db.collection('analisis_gemini').insertOne(documentoAnalisis);
    
    res.json({
      success: true,
      analisis_id: result.insertedId,
      tienda: tienda.properties.nombre,
      recomendaciones: analisisPrevisita
    });
    
  } catch (error) {
    console.error('❌ Error en análisis pre-visita:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 2. ANÁLISIS POST-VISITA
app.post('/api/gemini/postvisita', async (req, res) => {
  try {
    const { visita_id } = req.body;
    const { ObjectId } = require('mongodb');
    
    // Obtener datos de la visita completada
    const visita = await db.collection('visitas').findOne({
      _id: new ObjectId(visita_id),
      completada: true
    });
    
    if (!visita) {
      return res.status(404).json({ 
        success: false, 
        error: 'Visita no encontrada o no completada' 
      });
    }
    
    // Obtener feedback capturado en esta visita
    const feedbackTendero = await db.collection('feedback_tendero')
      .find({ visita_id: new ObjectId(visita_id) })
      .toArray();
    
    const evaluacionTienda = await db.collection('feedback_tienda')
      .findOne({ visita_id: new ObjectId(visita_id) });
    
    // Obtener evidencias subidas
    const evidencias = await db.collection('evidencias')
      .find({ visita_id: new ObjectId(visita_id) })
      .toArray();
    
    // Obtener análisis pre-visita si existe
    const analisisPrevisita = await db.collection('analisis_gemini')
      .findOne({
        tienda_id: visita.tienda_id,
        tipo_analisis: "previsita",
        colaborador_id: visita.colaborador_id,
        fecha_analisis: { 
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() 
        }
      });
    
    // Obtener visita anterior para comparación
    const visitaAnterior = await db.collection('visitas')
      .findOne({
        tienda_id: visita.tienda_id,
        completada: true,
        fecha_realizada: { $lt: visita.fecha_realizada }
      }, { sort: { fecha_realizada: -1 } });
    
    // Preparar contexto para análisis
    const contextoPostvisita = {
      visita_actual: visita,
      feedback_tendero: feedbackTendero,
      evaluacion_tienda: evaluacionTienda,
      evidencias: evidencias,
      analisis_previsita: analisisPrevisita?.recomendaciones || null,
      visita_anterior: visitaAnterior,
      mejoras_implementadas: [],
      nuevos_problemas: []
    };
    
    // Analizar con Gemini
    const geminiService = new GeminiService();
    const analisisPostvisita = await geminiService.generarAnalisisPostvisita(contextoPostvisita);
    
    // Guardar análisis
    const documentoAnalisis = {
      visita_id: new ObjectId(visita_id),
      tienda_id: visita.tienda_id,
      tipo_analisis: "postvisita",
      fecha_analisis: new Date().toISOString(),
      resultados: analisisPostvisita,
      seguimiento_requerido: analisisPostvisita.nivel_seguimiento === "alto",
      acciones_recomendadas: analisisPostvisita.acciones_inmediatas || []
    };
    
    await db.collection('analisis_gemini').insertOne(documentoAnalisis);
    
    res.json({
      success: true,
      visita_id: visita_id,
      analisis: analisisPostvisita
    });
    
  } catch (error) {
    console.error('❌ Error en análisis post-visita:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. ANÁLISIS DE TENDENCIAS
app.get('/api/gemini/tendencias', async (req, res) => {
  try {
    const { periodo = "3meses", sector = "all" } = req.query;
    
    // Calcular fechas según período
    let fechaInicio = new Date();
    switch(periodo) {
      case "1mes": fechaInicio.setMonth(fechaInicio.getMonth() - 1); break;
      case "3meses": fechaInicio.setMonth(fechaInicio.getMonth() - 3); break;
      case "6meses": fechaInicio.setMonth(fechaInicio.getMonth() - 6); break;
      case "1año": fechaInicio.setFullYear(fechaInicio.getFullYear() - 1); break;
    }
    
    // Obtener datos agregados
    const feedbackTendencias = await db.collection('feedback_tendero')
      .find({ fecha: { $gte: fechaInicio.toISOString() } })
      .toArray();
    
    const evaluacionesTendencias = await db.collection('feedback_tienda')
      .find({ fecha: { $gte: fechaInicio.toISOString() } })
      .toArray();
    
    // Agrupar por categorías y tipos
    const problemasFrecuentes = {};
    feedbackTendencias.forEach(feedback => {
      const key = `${feedback.categoria}-${feedback.tipo}`;
      problemasFrecuentes[key] = (problemasFrecuentes[key] || 0) + 1;
    });
    
    // Análisis de patrones estacionales
    const patronesMensuales = {};
    feedbackTendencias.forEach(feedback => {
      const mes = new Date(feedback.fecha).getMonth();
      patronesMensuales[mes] = (patronesMensuales[mes] || 0) + 1;
    });
    
    // Preparar contexto para Gemini
    const contextoTendencias = {
      periodo_analisis: periodo,
      total_feedback: feedbackTendencias.length,
      total_evaluaciones: evaluacionesTendencias.length,
      problemas_frecuentes: problemasFrecuentes,
      patrones_mensuales: patronesMensuales,
      sector: sector
    };
    
    // Generar análisis de tendencias
    const geminiService = new GeminiService();
    const tendencias = await geminiService.generarAnalisisTendencias(contextoTendencias);
    
    res.json({
      success: true,
      periodo: periodo,
      data_points: feedbackTendencias.length + evaluacionesTendencias.length,
      tendencias: tendencias
    });
    
  } catch (error) {
    console.error('❌ Error en análisis de tendencias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PREDICCIÓN DE PROBLEMAS
app.post('/api/gemini/prediccion/:tiendaId', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.tiendaId);
    
    // Obtener historial completo de la tienda
    const feedback6Meses = await db.collection('feedback_tendero')
      .find({ 
        tienda_id: tiendaId,
        fecha: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString() }
      })
      .sort({ fecha: 1 })
      .toArray();
    
    const evaluaciones6Meses = await db.collection('feedback_tienda')
      .find({ 
        tienda_id: tiendaId,
        fecha: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString() }
      })
      .sort({ fecha: 1 })
      .toArray();
    
    // Obtener métricas actuales
    const geoJsonDoc = await db.collection('puntos_venta').findOne({});
    const tienda = geoJsonDoc.features.find(f => 
      parseInt(f.properties.col0) === tiendaId
    );
    
    // Análisis predictivo con Gemini
    const contextoPrediccion = {
      tienda: tienda.properties,
      historial_feedback: feedback6Meses,
      historial_evaluaciones: evaluaciones6Meses,
      metricas_actuales: {
        nps: tienda.properties.nps,
        damage_rate: tienda.properties.damage_rate,
        out_of_stock: tienda.properties.out_of_stock
      }
    };
    
    const geminiService = new GeminiService();
    const predicciones = await geminiService.generarPredicciones(contextoPrediccion);
    
    res.json({
      success: true,
      tienda_id: tiendaId,
      predicciones: predicciones
    });
    
  } catch (error) {
    console.error('❌ Error en predicciones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AGREGAR ESTOS ENDPOINTS A TU SERVER.JS (al final, antes del app.listen)

// ✅ 1. FEEDBACK DEL TENDERO (hacia la empresa)
app.post('/api/feedback/tendero', async (req, res) => {
  try {
    const {
      visita_id,
      tienda_id, 
      colaborador_id,
      categoria,
      tipo,
      urgencia,
      titulo,
      descripcion
    } = req.body;
    
    // Validaciones básicas
    if (!tienda_id || !colaborador_id || !categoria || !tipo || !titulo || !descripcion) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }
    
    const { ObjectId } = require('mongodb');
    
    const feedback = {
      visita_id: visita_id ? new ObjectId(visita_id) : null,
      tienda_id: parseInt(tienda_id),
      colaborador_id: new ObjectId(colaborador_id),
      fecha: new Date().toISOString(),
      categoria, // "servicio", "entrega", "producto", "facturacion", "otro"
      tipo,      // "queja", "sugerencia", "felicitacion", "reporte_incidente"
      urgencia,  // "baja", "media", "alta", "critica"
      titulo,
      descripcion,
      estado: "nuevo",
      seguimiento_requerido: urgencia === "critica" || urgencia === "alta",
      fecha_resolucion: null,
      notas_resolucion: ""
    };
    
    const result = await db.collection('feedback_tendero').insertOne(feedback);
    
    console.log(`✅ Feedback del tendero guardado con ID: ${result.insertedId}`);
    
    res.json({
      success: true,
      feedback_id: result.insertedId,
      message: "Feedback del tendero registrado correctamente",
      seguimiento_requerido: feedback.seguimiento_requerido
    });
    
  } catch (error) {
    console.error('❌ Error guardando feedback del tendero:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 2. FEEDBACK DEL COLABORADOR (hacia la tienda)
app.post('/api/feedback/tienda', async (req, res) => {
  try {
    const {
      visita_id,
      tienda_id,
      colaborador_id,
      aspectos,
      puntos_fuertes,
      areas_mejora,
      observaciones_generales,
      recomendaciones_prioritarias
    } = req.body;
    
    // Validaciones básicas
    if (!tienda_id || !colaborador_id) {
      return res.status(400).json({
        success: false,
        error: 'tienda_id y colaborador_id son requeridos'
      });
    }
    
    const { ObjectId } = require('mongodb');
    
    const evaluacion = {
      visita_id: visita_id ? new ObjectId(visita_id) : null,
      tienda_id: parseInt(tienda_id),
      colaborador_id: new ObjectId(colaborador_id),
      fecha: new Date().toISOString(),
      aspectos: aspectos || {
        limpieza: { calificacion: 0, comentarios: "" },
        mobiliario: { calificacion: 0, comentarios: "" },
        inventario: { 
          productos_estrella: [],
          productos_baja_rotacion: [],
          faltantes_detectados: [],
          sugerencias_nuevos_productos: []
        },
        atencion_cliente: { calificacion: 0, comentarios: "" },
        organizacion: { calificacion: 0, comentarios: "" }
      },
      observaciones_generales: observaciones_generales || "",
      puntos_fuertes: puntos_fuertes || [],
      areas_mejora: areas_mejora || [],
      recomendaciones_prioritarias: recomendaciones_prioritarias || []
    };
    
    const result = await db.collection('feedback_tienda').insertOne(evaluacion);
    
    console.log(`✅ Evaluación de tienda guardada con ID: ${result.insertedId}`);
    
    res.json({
      success: true,
      evaluacion_id: result.insertedId,
      message: "Evaluación de tienda registrada correctamente"
    });
    
  } catch (error) {
    console.error('❌ Error guardando evaluación de tienda:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 3. OBTENER FEEDBACK DEL TENDERO POR TIENDA
app.get('/api/feedback/tendero/:tiendaId', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.tiendaId);
    const { limite = 20 } = req.query;
    
    const feedback = await db.collection('feedback_tendero')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(parseInt(limite))
      .toArray();
    
    res.json({
      success: true,
      count: feedback.length,
      data: feedback
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo feedback del tendero:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 4. OBTENER EVALUACIONES DE TIENDA
app.get('/api/feedback/tienda/:tiendaId', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.tiendaId);
    const { limite = 10 } = req.query;
    
    const evaluaciones = await db.collection('feedback_tienda')
      .find({ tienda_id: tiendaId })
      .sort({ fecha: -1 })
      .limit(parseInt(limite))
      .toArray();
    
    res.json({
      success: true,
      count: evaluaciones.length,
      data: evaluaciones
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo evaluaciones de tienda:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 5. ENDPOINT PARA SUBIR EVIDENCIAS (básico)
app.post('/api/evidencias', async (req, res) => {
  try {
    const {
      visita_id,
      tipo,
      descripcion,
      url,
      coordenadas
    } = req.body;
    
    if (!visita_id || !tipo || !url) {
      return res.status(400).json({
        success: false,
        error: 'visita_id, tipo y url son requeridos'
      });
    }
    
    const { ObjectId } = require('mongodb');
    
    const evidencia = {
      visita_id: new ObjectId(visita_id),
      tipo, // "foto_fachada", "foto_interior", "foto_productos", "foto_problema", "documento"
      url,
      descripcion: descripcion || "",
      coordenadas: coordenadas || null,
      timestamp: new Date().toISOString(),
      subido_por: null, // Se puede agregar después
      tamaño_bytes: null,
      formato: url.split('.').pop() || 'unknown'
    };
    
    const result = await db.collection('evidencias').insertOne(evidencia);
    
    console.log(`✅ Evidencia guardada con ID: ${result.insertedId}`);
    
    res.json({
      success: true,
      evidencia_id: result.insertedId,
      message: "Evidencia registrada correctamente"
    });
    
  } catch (error) {
    console.error('❌ Error guardando evidencia:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 6. OBTENER EVIDENCIAS DE UNA VISITA
app.get('/api/evidencias/:visitaId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const visitaId = req.params.visitaId;
    
    const evidencias = await db.collection('evidencias')
      .find({ visita_id: new ObjectId(visitaId) })
      .sort({ timestamp: -1 })
      .toArray();
    
    res.json({
      success: true,
      count: evidencias.length,
      data: evidencias
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo evidencias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 7. OBTENER ANÁLISIS GEMINI DE UNA TIENDA
app.get('/api/gemini/analisis/:tiendaId', async (req, res) => {
  try {
    const tiendaId = parseInt(req.params.tiendaId);
    const { tipo, limite = 5 } = req.query;
    
    let filtro = { tienda_id: tiendaId };
    if (tipo) {
      filtro.tipo_analisis = tipo; // "previsita", "postvisita", "tendencias", "prediccion"
    }
    
    const analisis = await db.collection('analisis_gemini')
      .find(filtro)
      .sort({ fecha_analisis: -1 })
      .limit(parseInt(limite))
      .toArray();
    
    res.json({
      success: true,
      count: analisis.length,
      data: analisis
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo análisis Gemini:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 8. DASHBOARD - RESUMEN EJECUTIVO
app.get('/api/dashboard/resumen', async (req, res) => {
  try {
    const { periodo = "30" } = req.query; // días
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - parseInt(periodo));
    
    // Estadísticas de visitas
    const visitasRealizadas = await db.collection('visitas')
      .countDocuments({ 
        completada: true,
        fecha_realizada: { $gte: fechaLimite.toISOString() }
      });
    
    const visitasPendientes = await db.collection('visitas')
      .countDocuments({ 
        estado: "programada",
        fecha_programada: { $gte: new Date().toISOString() }
      });
    
    // Feedback crítico
    const feedbackCritico = await db.collection('feedback_tendero')
      .countDocuments({ 
        urgencia: "critica",
        estado: "nuevo",
        fecha: { $gte: fechaLimite.toISOString() }
      });
    
    // Tiendas con problemas
    const geoJsonDoc = await db.collection('puntos_venta').findOne({});
    const tiendasProblematicas = geoJsonDoc.features.filter(f => {
      const props = f.properties;
      return props.nps < 30 || props.out_of_stock > 4 || props.damage_rate > 1;
    }).length;
    
    // Análisis Gemini recientes
    const analisisRecientes = await db.collection('analisis_gemini')
      .countDocuments({ 
        fecha_analisis: { $gte: fechaLimite.toISOString() }
      });
    
    res.json({
      success: true,
      periodo_dias: parseInt(periodo),
      resumen: {
        visitas_realizadas: visitasRealizadas,
        visitas_pendientes: visitasPendientes,
        feedback_critico: feedbackCritico,
        tiendas_problematicas: tiendasProblematicas,
        analisis_gemini_generados: analisisRecientes,
        total_tiendas: geoJsonDoc.features.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error generando resumen ejecutivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ 9. NOTIFICACIONES BÁSICAS (para después implementar push)
app.get('/api/notificaciones/:userId', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const userId = req.params.userId;
    
    // Por ahora generar notificaciones simples basadas en visitas pendientes
    const visitasPendientes = await db.collection('visitas')
      .find({
        $or: [
          { colaborador_id: new ObjectId(userId) },
          { asesor_id: new ObjectId(userId) }
        ],
        estado: "programada",
        fecha_programada: { 
          $gte: new Date().toISOString(),
          $lte: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // próximas 24 horas
        }
      })
      .toArray();
    
    const notificaciones = visitasPendientes.map(visita => ({
      id: visita._id,
      tipo: "visita_pendiente",
      titulo: "Visita programada",
      mensaje: `Tienes una visita programada para mañana`,
      fecha: visita.fecha_programada,
      leida: false,
      datos: {
        visita_id: visita._id,
        tienda_id: visita.tienda_id
      }
    }));
    
    res.json({
      success: true,
      count: notificaciones.length,
      data: notificaciones
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo notificaciones:', error);
    res.status(500).json({ success: false, error: error.message });
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