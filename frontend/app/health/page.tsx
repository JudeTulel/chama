import { LoanHealthClient } from '../../components/LoanHealthClient';

export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return <LoanHealthClient mode="health" />;
}
