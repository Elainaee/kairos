import { createRouter, createWebHashHistory } from "vue-router";
import HabitsView from "../views/HabitsView.vue";
import EmbeddedLegacyView from "../views/EmbeddedLegacyView.vue";
import MusicView from "../views/MusicView.vue";

const FocusView = () => import("../views/FocusView.vue");

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/calendar" },
    { path: "/calendar", component: EmbeddedLegacyView, props: { page: "calendar" } },
    // Keep the original Schedule DOM/CSS/controller intact.  Vue owns only
    // the surrounding route and state bridge, so its edit dialog is the same
    // implementation as the approved legacy screen.
    { path: "/schedule", component: EmbeddedLegacyView, props: { page: "schedule" } },
    { path: "/habits", component: HabitsView },
    { path: "/music", component: MusicView },
    { path: "/focus", component: FocusView, props: { mode: "hub" } },
    { path: "/focus/records", component: FocusView, props: { mode: "records" } }
  ]
});
