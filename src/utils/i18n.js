const en = require('../locales/en.json');
const ar = require('../locales/ar.json');

const dictionaries = { en, ar };

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), obj);
}

function t(lang, key, vars = {}) {
  const dict = dictionaries[lang] || dictionaries.ar;
  let template = resolvePath(dict, key) ?? resolvePath(dictionaries.en, key) ?? key;
  if (typeof template !== 'string') return key;

  for (const [varKey, varVal] of Object.entries(vars)) {
    template = template.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varVal ?? ''));
  }
  return template;
}

module.exports = { t, dictionaries };
