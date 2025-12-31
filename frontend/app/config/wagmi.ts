import { http, createConfig } from 'wagmi';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [hardhat, mainnet, sepolia],
  connectors: [
    injected(), // MetaMask and other injected wallets
  ],
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

// Re-export chains for use in components
export { hardhat, mainnet, sepolia };

