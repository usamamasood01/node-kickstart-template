const fs = require('fs');

const obj = JSON.parse(fs.readFileSync('.prettierrc', 'utf8'));

module.exports = {
  extends: ['airbnb', 'prettier', 'plugin:node/recommended'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': ['error', obj],
    'no-console': 'off',
    'func-names': 'off',
  },
};
