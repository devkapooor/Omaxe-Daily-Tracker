import base from '../../eslint.config.js'
import globals from 'globals'
export default [...base,{files:['tests/drill/**/*.cjs'],languageOptions:{globals:{...globals.node,...globals.browser}},rules:{'@typescript-eslint/no-require-imports':'off'}}]
