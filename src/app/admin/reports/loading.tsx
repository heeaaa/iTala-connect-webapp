import { TitlePlate } from '@/components/platform/platform-frame';

import styles from '@/features/reports/reports.module.css';

export default function ReportsLoading() {
  return (
    <>
      <TitlePlate title="Reports" sub="Preparing your events and report options" />
      <p role="status" className={styles.loading}>
        Loading reports…
      </p>
    </>
  );
}
