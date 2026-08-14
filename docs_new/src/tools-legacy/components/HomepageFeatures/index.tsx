import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

import Translate from '@docusaurus/Translate';

type FeatureItem = {
	title: ReactNode;
	description: ReactNode;
	to: string;
	cta: ReactNode;
};

const FeatureList: FeatureItem[] = [
	{
		title: <Translate>phone_book.json Editor</Translate>,
		to: '/phone-book-editor',
		description: (
			<Translate>
				Build or edit your phone_book.json visually — import an existing file, adjust brands and
				phones, and export the result.
			</Translate>
		),
		cta: <Translate>Open editor</Translate>
	},
	{
		title: <Translate>Config Editor</Translate>,
		to: '/config-generator',
		description: (
			<Translate>
				Build or edit config.js with a visual editor — import an existing config, adjust settings,
				and export the result.
			</Translate>
		),
		cta: <Translate>Open editor</Translate>
	},
	{
		title: <Translate>Theme Generator</Translate>,
		to: '/theme-generator',
		description: (
			<Translate>
				Pick colors, preview the graph and UI in light and dark mode, and download a ready-to-drop
				theme.css file.
			</Translate>
		),
		cta: <Translate>Open generator</Translate>
	}
];

function Feature({ title, description, to, cta }: FeatureItem) {
	return (
		<div className={clsx('col col--4', styles.featureCol)}>
			<article className={styles.featureCard}>
				<div className={styles.featureBody}>
					<Heading as="h3" className={styles.featureTitle}>
						{title}
					</Heading>
					<p className={styles.featureDescription}>{description}</p>
				</div>
				<Link to={to} className={clsx('button button--primary', styles.featureButton)}>
					{cta}
					<span aria-hidden="true" className={styles.featureButtonArrow}>
						→
					</span>
				</Link>
			</article>
		</div>
	);
}

export default function HomepageFeatures(): ReactNode {
	return (
		<section className={styles.features}>
			<div className="container">
				<header className={styles.featuresHeader}>
					<Heading as="h2" className={styles.featuresHeading}>
						<Translate>Useful tools</Translate>
					</Heading>
					<p className={styles.featuresSubheading}>
						<Translate>
							Visual editors and generators that help you set up modernGraphTool — no hand-editing
							required.
						</Translate>
					</p>
				</header>
				<div className={clsx('row', styles.featuresRow)}>
					{FeatureList.map((props, idx) => (
						<Feature key={idx} {...props} />
					))}
				</div>
			</div>
		</section>
	);
}
