const { normalizeUserText } = require("./textUtils");

function detectIntent(message) {
  const normalized = normalizeUserText(message);

  return {
    normalized,
    greetingOnly:
      /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|que tal|hey|ey|holi|excelente tarde)[!. ]*$/.test(
        normalized
      ),
    thanksOnly:
      /^(gracias|muchas gracias|ok gracias|sale gracias|perfecto gracias|grcs)[!. ]*$/.test(
        normalized
      ),
    socialOnly:
      /^(como estas|como te encuentras|como andas|que tal estas)[?.! ]*$/.test(
        normalized
      ),
    offTopic:
      /(direccion|colonia|municipio|correo|email|telefono secundario|telefono alterno|datos del cliente|numero de cliente|cliente id)/.test(
        normalized
      ),
    writeAction:
      /(registrar un pago|registrar pago|quiero registrar un pago|quiero registrar pago|aplicar un pago|subir comprobante|adjuntar comprobante|modificar pago|editar pago|eliminar pago|actualizar pago|hacer un pago|realizar un pago)/.test(
        normalized
      ),
    wantsAllCredits:
      /(mis creditos|todos mis creditos|como van mis creditos|resumen de mis creditos|informacion de mis creditos|balances de mis creditos|balance de mis creditos|saldos de mis creditos|cuales son los balances de mis creditos|cuales son los saldos de mis creditos)/.test(
        normalized
      ),
    multipleCreditsCorrection:
      /(tengo\s+\d+\s+creditos?|tengo dos creditos?|tengo mas de un credito|tengo varios creditos|son\s+\d+\s+creditos?|son dos creditos?|mas de un credito|varios creditos|olvide mencionar.*credit|se me olvido mencionar.*credit|disculpe.*credit)/.test(
        normalized
      ),
    paymentIntent:
      /(ultimo pago|ultimos pagos|mis pagos|historial de pagos|abono|abone|pague|pago realizado|pago de este mes|ya pague|ya realice el pago|fecha de pago|pagos)/.test(
        normalized
      ),
    paidThisMonth:
      /(ya pague este mes|ya realice el pago de este mes|pago de este mes|ya tengo registrado el pago de este mes)/.test(
        normalized
      ),
    paymentCount:
      /(cuantos pagos|cuantos abonos|total de pagos|total de abonos|cuantos he pagado)/.test(
        normalized
      ),
    additionalCharges:
      /(agua|predial)/.test(normalized),
    debt:
      /(adeudo|mora|vencido|pendiente al dia|debo hoy|pago vencido)/.test(
        normalized
      ),
    balance:
      /(saldo restante|balance|cuanto debo|cuanto me falta|resta por pagar|balance total|saldo total|saldo del credito)/.test(
        normalized
      ),
    monthlyPayment: /mensualidad/.test(normalized),
    nextPayment: /proximo pago/.test(normalized),
    lotOrBlock: /(lote|manzana)/.test(normalized),
    term: /plazo/.test(normalized),
    startDate: /fecha de inicio/.test(normalized),
    creditDetail:
      /(resumen|informacion de mi credito|informacion acerca de mi credito|detalles del credito|credito)/.test(
        normalized
      ),
  };
}

module.exports = {
  detectIntent,
};
