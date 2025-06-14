# 🏪 Puntos de venta API

API REST para análisis de rendimiento operativo de tiendas OXXO. Proporciona acceso a métricas de NPS, desabasto, daños y tiempos de resolución de quejas.

## 🚀 Quick Start

### Prerrequisitos
- Node.js 16+
- MongoDB Atlas account
- npm o yarn

### Instalación local
```bash
# Clonar repositorio
git clone https://github.com/tuusuario/tiendas-retail-api.git
cd tiendas-retail-api

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu connection string de MongoDB

# Iniciar servidor de desarrollo
npm run dev
```

### Variables de entorno requeridas
```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/dimeloc_data
PORT=3000
NODE_ENV=development
```

## 📊 Endpoints disponibles

### Base URL
- **Desarrollo:** `http://localhost:3000/api`
- **Producción:** `https://tiendas-retail-api.onrender.com/api`

### 🏪 Tiendas
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/tiendas` | GET | Obtener todas las tiendas (63 ubicaciones) |
| `/tiendas/:id` | GET | Obtener tienda específica por ID |
| `/tiendas/nps/:minimo` | GET | Filtrar tiendas por NPS mínimo |
| `/tiendas/problematicas` | GET | Tiendas que requieren atención urgente |
| `/tiendas/cerca/:lat/:lng/:radio` | GET | Buscar tiendas por ubicación geográfica |

### 📈 Analytics
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/stats` | GET | Estadísticas generales del negocio |
| `/geojson` | GET | Datos geográficos originales |
| `/health` | GET | Health check del servidor |

## 💡 Ejemplos de uso

### Obtener todas las tiendas
```javascript
fetch('https://tiendas-retail-api.onrender.com/api/tiendas')
  .then(response => response.json())
  .then(data => {
    console.log(`Total tiendas: ${data.count}`);
    console.log('Tiendas:', data.data);
  });
```

### Buscar tiendas problemáticas
```javascript
fetch('https://tiendas-retail-api.onrender.com/api/tiendas/problematicas')
  .then(response => response.json())
  .then(data => {
    console.log(`Tiendas que necesitan atención: ${data.count}`);
    data.data.forEach(tienda => {
      console.log(`${tienda.nombre}: NPS ${tienda.nps}`);
    });
  });
```

### Filtrar por NPS alto
```javascript
fetch('https://tiendas-retail-api.onrender.com/api/tiendas/nps/50')
  .then(response => response.json())
  .then(data => {
    console.log(`Tiendas con NPS ≥ 50: ${data.count}`);
  });
```

## 📱 Estructura de respuesta

### Tienda individual
```json
{
  "_id": 0,
  "nombre": "OXXO Paseo del Acueducto",
  "location": {
    "longitude": -100.2998256,
    "latitude": 25.6244792
  },
  "nps": 39.9,
  "fillfoundrate": 97.7,
  "damage_rate": 0.55,
  "out_of_stock": 3.57,
  "complaint_resolution_time_hrs": 24.7
}
```

### Estadísticas generales
```json
{
  "success": true,
  "data": {
    "total_tiendas": 63,
    "nps_promedio": 42.5,
    "nps_maximo": 100,
    "nps_minimo": -95,
    "damage_rate_promedio": 0.62,
    "out_of_stock_promedio": 2.98,
    "tiempo_quejas_promedio": 28.4,
    "tiendas_problematicas": 15
  }
}
```

## 🎯 Criterios de negocio

### Tiendas problemáticas
Una tienda se considera problemática si cumple **cualquiera** de estos criterios:
- NPS < 30
- Desabasto > 4%
- Tasa de daños > 1%
- Tiempo de resolución de quejas > 48 horas

### Métricas clave
- **NPS (Net Promoter Score):** Rango de -100 a 100
- **Fill Found Rate:** Disponibilidad de productos (%)
- **Damage Rate:** Porcentaje de productos dañados
- **Out of Stock:** Porcentaje de desabasto
- **Complaint Resolution Time:** Tiempo promedio de resolución (horas)


## 📊 Roadmap

### v1.1 (Próximamente)
- [ ] Autenticación JWT
- [ ] Rate limiting
- [ ] Cache con Redis
- [ ] Endpoints de escritura (POST/PUT)
- [ ] Webhooks para actualizaciones

## 🏷️ Tags

`#nodejs` `#express` `#mongodb` `#api-rest` `#retail` `#analytics` `#geolocation`