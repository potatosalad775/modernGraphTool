import React, { useState, useId, type ReactNode } from 'react';
import styles from '../ConfigEditor.module.css';

interface AccordionSectionProps {
  id: string;
  title: string;
  description?: string;
  learnMoreHref?: string;
  /** Show an enable/disable toggle in the header */
  optional?: boolean;
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function AccordionSection({
  id,
  title,
  description,
  learnMoreHref,
  optional = false,
  enabled = true,
  onToggleEnabled,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={styles.ceSection} id={id}>
      <div
        className={styles.ceSectionHeader}
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={contentId}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className={`${styles.ceSectionChevron} ${open ? styles.ceSectionChevronOpen : ''}`}>
          &#9654;
        </span>
        <span className={styles.ceSectionTitle}>{title}</span>
        {optional && (
          <label
            className={styles.ceSectionToggle}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className={styles.ceCheckbox}
              checked={enabled}
              onChange={(e) => onToggleEnabled?.(e.target.checked)}
            />
          </label>
        )}
      </div>
      {open && (
        <div className={styles.ceSectionBody} id={contentId}>
          {description && (
            <div className={styles.ceSectionDescription}>
              {description}
              {learnMoreHref && (
                <>
                  {' '}
                  <a
                    href={learnMoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.ceSectionLearnMore}
                  >
                    Learn more
                  </a>
                </>
              )}
            </div>
          )}
          {optional && !enabled ? (
            <div className={styles.ceSectionDescription}>
              This section is disabled. Enable it to configure these settings.
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
