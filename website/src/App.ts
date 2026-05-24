import {
  createElement,
  Router,
  Route,
  Fragment,
} from "@asymmetric-effort/specifyjs";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Features } from "./pages/Features";
import { Cli } from "./pages/Cli";
import { Api } from "./pages/Api";

export function App(): ReturnType<typeof createElement> {
  return createElement(
    Fragment,
    null,
    createElement(Nav, null),
    createElement(
      "main",
      { className: "main", role: "main" },
      createElement(
        Router,
        null,
        createElement(Route, { path: "/", component: Home, exact: true }),
        createElement(Route, {
          path: "/features",
          component: Features,
          exact: true,
        }),
        createElement(Route, { path: "/cli", component: Cli, exact: true }),
        createElement(Route, { path: "/api", component: Api, exact: true }),
      ),
    ),
    createElement(Footer, null),
  );
}
