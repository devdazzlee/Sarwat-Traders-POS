import CustomerLedgerService from '../src/services/customer-ledger.service';

const customerId = process.argv[2] ?? '3ffb17f1-9350-4849-9198-6cff2cd41207';

async function main() {
  const service = new CustomerLedgerService();
  const result = await service.syncCustomerBalances(customerId);
  console.log(`Synced customer ${customerId}. Correct balance: ${result.balance}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
