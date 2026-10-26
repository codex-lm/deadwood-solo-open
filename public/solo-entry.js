import './solo-boot.js';
import { getLanguage, setLanguage, translateDom } from './i18n.js';
import { installSoloUi } from './solo-ui.js';
import './client.js';

translateDom();
installSoloUi();
const language = document.getElementById('language-select');
language.value = getLanguage();
language.addEventListener('change', event => setLanguage(event.target.value));
