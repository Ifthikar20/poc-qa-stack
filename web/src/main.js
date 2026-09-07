import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './app.css';

// Pinia before the router: the navigation guard calls useSession(), which
// needs an active pinia. Installing the router first makes the first guard run
// against no store and throw before anything renders.
createApp(App).use(createPinia()).use(router).mount('#app');
