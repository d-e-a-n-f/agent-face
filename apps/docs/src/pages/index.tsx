import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";

import styles from "./index.module.css";

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/quick-start">
            Quick start
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/playground">
            See the demo
          </Link>
        </div>
      </div>
    </header>
  );
}

const points: readonly { title: string; body: string }[] = [
  {
    title: "Typed actions, not clicks",
    body: "Features expose business intent — invoice.send, product.publish — with typed inputs, preconditions, and previews. Never clickButton.",
  },
  {
    title: "Humans confirm what matters",
    body: "Consequential actions pause on a confirmation card bound to the exact prepared operation. Stale state is rejected, confirmations are single-use.",
  },
  {
    title: "An assistant that knows your app",
    body: "Ships with a chat widget that reads your screens, fills your real forms, follows your help docs, suggests next steps, and works across pages.",
  },
];

export default function Home(): ReactNode {
  return (
    <Layout description="AgentFace — the agent interface layer for software.">
      <Hero />
      <main className="container margin-vert--lg">
        <div className="row">
          {points.map((point) => (
            <div key={point.title} className="col col--4">
              <Heading as="h3">{point.title}</Heading>
              <p>{point.body}</p>
            </div>
          ))}
        </div>
      </main>
    </Layout>
  );
}
