import "@fontsource/manrope/400.css"
import "@fontsource/manrope/500.css"
import "@fontsource/manrope/600.css"
import "@fontsource/manrope/700.css"
import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import { router } from "./router"
import "./styles.css"

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount("#app")
