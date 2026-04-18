const MINUTOS_MAP = {
    'uno': 1, 'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
    'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
    'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
    'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
    'veinte': 20, 'veintiuno': 21, 'veintidos': 22, 'veintitres': 23,
    'veinticuatro': 24, 'veinticinco': 25, 'veintiseis': 26, 'veintisiete': 27,
    'veintiocho': 28, 'veintinueve': 29, 'treinta': 30,
    'treinta y uno': 31, 'treinta y dos': 32, 'treinta y tres': 33,
    'treinta y cuatro': 34, 'treinta y cinco': 35, 'treinta y seis': 36,
    'treinta y siete': 37, 'treinta y ocho': 38, 'treinta y nueve': 39,
    'cuarenta': 40, 'cuarenta y uno': 41, 'cuarenta y dos': 42,
    'cuarenta y tres': 43, 'cuarenta y cuatro': 44, 'cuarenta y cinco': 45,
    'cuarenta y seis': 46, 'cuarenta y siete': 47, 'cuarenta y ocho': 48,
    'cuarenta y nueve': 49, 'cincuenta': 50, 'cincuenta y uno': 51,
    'cincuenta y dos': 52, 'cincuenta y tres': 53, 'cincuenta y cuatro': 54,
    'cincuenta y cinco': 55, 'cincuenta y seis': 56, 'cincuenta y siete': 57,
    'cincuenta y ocho': 58, 'cincuenta y nueve': 59
};
const HORAS_MAP = { 'una': 1, 'un': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11, 'doce': 12 };

// Version Asistente.html (Doble escape porque se pone dentro de cadena '' en la misma tool pero de fondo es js string)
const horasPalabras = 'una|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce';
const minPalabras = 'en\\s+punto|cuarto|media|uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|treinta(?:\\s+y\\s+(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?|cuarenta(?:\\s+y\\s+(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?|cincuenta(?:\\s+y\\s+(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?';

function _parsearMin(str) {
    if (!str) return 0;
    str = str.trim().toLowerCase();
    if (/en\s*punto/.test(str)) return 0;
    if (str === 'cuarto') return 15;
    if (str === 'media') return 30;
    const n = parseInt(str, 10);
    if (!isNaN(n) && n >= 0 && n <= 59) return n;
    if (MINUTOS_MAP[str] !== undefined) return MINUTOS_MAP[str];
    return 0;
}
function _parsearHoraNum(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    const n = parseInt(str, 10);
    if (!isNaN(n)) return n;
    return HORAS_MAP[str] || null;
}

function probar(texto) {
    const textoLower = texto.toLowerCase();
    let horaDetectada = null;
    let minDetectado = 0;
    let periodoDetectado = null;
    
    // Paso C
    const generalRx = new RegExp(
        '(?:a\\s+)?las?\\s+(' + horasPalabras + '|\\d{1,2})(?:\\s*(?:y|con|:|\\.|\\-)\\s*(' + minPalabras + '|\\d{1,2}))?\\s*(?:(?:de|en|por)\\s+la\\s+)?(manana|madrugada|tarde|noche)?\\s*(?:del?\\s+)?(mediodia|medio\\s*dia|dia)?\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?)?', 'i'
    );
    const gM = textoLower.match(generalRx);
    if (gM) {
        horaDetectada = _parsearHoraNum(gM[1]);
        minDetectado = _parsearMin(gM[2]);
        periodoDetectado = gM[3] || gM[4] || gM[5] || null;
    }
    
    return { h: horaDetectada, m: minDetectado, p: periodoDetectado };
}

console.log("Probando: a las 8 y 41 de la noche");
console.log(probar("a las 8 y 41 de la noche"));

console.log("Probando: a las ocho y cuarenta y uno de la noche");
console.log(probar("a las ocho y cuarenta y uno de la noche"));

console.log("Probando: a la 1 y media");
console.log(probar("a la 1 y media"));
