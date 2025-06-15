// server.js - API para datos GeoJSON de tiendas OXXO
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

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Todas las tiendas: http://localhost:${PORT}/api/tiendas`);
  console.log(`📈 Estadísticas: http://localhost:${PORT}/api/stats`);
  console.log(`🗺️  GeoJSON original: http://localhost:${PORT}/api/geojson`);
});