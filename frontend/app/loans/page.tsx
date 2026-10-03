import { LoanHealthClient } from '../../components/LoanHealthClient';

export const dynamic = 'force-dynamic';

export default function LoansPage() {
  return <LoanHealthClient mode="loans" />;
}
