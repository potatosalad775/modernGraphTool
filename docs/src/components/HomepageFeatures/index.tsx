import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

import Translate, {translate} from '@docusaurus/Translate';

type FeatureItem = {
  title: ReactNode;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: <Translate>Easy to Use</Translate>,
    description: (
      <Translate>
        modernGraphTool features a completely redesigned UI to improve user experience.
      </Translate>
    ),
  },
  {
    title: <Translate>Extensibility in Mind</Translate>,
    description: (
      <Translate>
        modernGraphTool is built with extensibility in mind. You can easily and safely extend modernGraphTool to fit your needs.
      </Translate>
    ),
  },
  {
    title: <Translate>Powered by Modern JS</Translate>,
    description: (
      <Translate>
        modernGraphTool is built with modern JavaScript technologies. 
      </Translate>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md padding-top--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
