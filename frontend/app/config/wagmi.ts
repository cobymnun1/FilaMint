import { http, createConfig } from 'wagmi';
import { mainnet, sepolia, baseSepolia, hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia, sepolia, mainnet, hardhat],
  connectors: [
    injected(), // MetaMask and other injected wallets
  ],
  transports: {
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [mainnet.id]: http(),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});

// Re-export chains for use in components
export { hardhat, mainnet, sepolia, baseSepolia };

