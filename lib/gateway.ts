// Payment gateway abstraction.
// The AI and payment service only ever see this interface — the sandbox can be
// swapped for the real Zytrex Payments API without touching anything above it.

export interface TransferInput {
  amount: number;
  currency: string;
  beneficiary: {
    name: string;
    bank_code: string;
    bank_name: string;
    account_mask: string;
  };
  purpose: string;
  reference: string;
}

export interface TransferResult {
  ok: boolean;
  provider_reference: string;
  status: 'SUCCESSFUL' | 'FAILED';
  failure_reason?: string;
}

export interface PaymentGateway {
  name: string;
  createTransfer(input: TransferInput): Promise<TransferResult>;
  getTransferStatus(providerReference: string): Promise<string>;
  verifyBeneficiary(accountMask: string, bankCode: string): Promise<{ verified: boolean; account_name?: string }>;
  getBalance(): Promise<number>;
  cancelTransfer(providerReference: string): Promise<boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SandboxZytrexGateway implements PaymentGateway {
  name = 'Zytrex Sandbox';

  async createTransfer(input: TransferInput): Promise<TransferResult> {
    // Simulate rail latency (~1.5s per the demo spec)
    await sleep(1500);
    const tag = input.reference.replace(/\D/g, '').slice(-6) || Date.now().toString(36).toUpperCase();
    return {
      ok: true,
      provider_reference: `ZXP${tag}${Math.floor(Math.random() * 90 + 10)}`,
      status: 'SUCCESSFUL',
    };
  }

  async getTransferStatus(): Promise<string> {
    await sleep(150);
    return 'SUCCESSFUL';
  }

  async verifyBeneficiary(): Promise<{ verified: boolean; account_name?: string }> {
    await sleep(400);
    return { verified: true };
  }

  async getBalance(): Promise<number> {
    return 0; // balances live on the ledger side in this demo
  }

  async cancelTransfer(): Promise<boolean> {
    await sleep(200);
    return true;
  }
}

let gateway: PaymentGateway | null = null;

export function getGateway(): PaymentGateway {
  if (!gateway) gateway = new SandboxZytrexGateway();
  return gateway;
}
