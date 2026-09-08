import GoalsPanel from "../components/GoalsPanel";
import { PlannerProvider } from "../components/PlannerProvider";

export default function App({ Component, pageProps }) {
  return <PlannerProvider>
    <GoalsPanel />
    <Component {...pageProps} />
  </PlannerProvider>;
}
