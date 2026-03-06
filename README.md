# Agente AI para Meta WhatsApp

Proyecto en Node.js que recibe mensajes desde WhatsApp Cloud API, consulta PostgreSQL y usa OpenAI para responder con un agente que opera con dos tools.

## Tools implementadas

### 1. `validar_cliente_por_telefono`
- Busca el cliente en `clientes.telefono`.
- Valida si existe un registro relacionado en `creditos` por `cliente_id`.
- Solo considera credito activo cuando `creditos.status = 1`.
- Si no existe cliente o no hay credito activo, el agente responde que se deben actualizar los datos del cliente.

### 2. `consultar_adeudo_credito`
- Consulta `detalle_credito` por `credito_id`.
- Suma el campo `adeudo` y devuelve el adeudo total.

## Requisitos

- Node.js 20+
- PostgreSQL
- Credenciales de OpenAI
- Credenciales de Meta WhatsApp Cloud API

## Variables de entorno

Copia `.env.example` a `.env` y completa:

```env
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mi_basedatos
USER=postgres
HOST=localhost
PASSWORD=postgres
DATABASE=mi_basedatos
PORTDB=5432
META_VERIFY_TOKEN=
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
```

Puedes usar `DATABASE_URL` o el formato separado con `USER`, `HOST`, `PASSWORD`, `DATABASE` y `PORTDB`.

## Ejecutar

```bash
npm install
npm run dev
```

## Endpoints

- `GET /webhook`: verificacion del webhook de Meta.
- `POST /webhook`: recibe mensajes entrantes de WhatsApp.
- `GET /health`: valida que la API y PostgreSQL respondan.

## Flujo

1. Meta envia un mensaje al webhook.
2. El agente recibe el telefono del remitente y el texto.
3. Primero llama `validar_cliente_por_telefono`.
4. Si hay credito activo y el usuario pregunta por adeudo, llama `consultar_adeudo_credito`.
5. La respuesta se envia al cliente por WhatsApp.

## Notas

- La busqueda del telefono normaliza caracteres no numericos.
- La coincidencia intenta validar tanto el numero completo como los ultimos 10 digitos.
- El proyecto usa `fetch` nativo de Node 20 para llamar a Meta.
