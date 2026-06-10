import "@fontsource/be-vietnam-pro/400.css"
import "@fontsource/be-vietnam-pro/500.css"
import "@fontsource/be-vietnam-pro/600.css"
import "@fontsource/be-vietnam-pro/700.css"
import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import { router } from "./router"
import "./styles.css"

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount("#app")
