require('dotenv').config()

module.exports = {
  deployments: {
    netId1: {
      eth: {
        instanceAddress:  undefined,
        symbol: 'ETH',
        decimals: 18
      },
      dai: {
        instanceAddress:  undefined,
        tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        symbol: 'DAI',
        decimals: 18
      },
      cdai: {
        instanceAddress:  undefined,
        tokenAddress: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
        symbol: 'cDAI',
        decimals: 8
      },
      usdc: {
        instanceAddress:  undefined,
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6
      },
      cusdc: {
        instanceAddress:  undefined,
        tokenAddress: '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
        symbol: 'cUSDC',
        decimals: 8
      },
      usdt: {
        instanceAddress:  undefined,
        tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        decimals: 6
      }
    },
    netId42: {
      eth: {
        instanceAddress: '0x754e47147A4FAE96bC0FaD6663a3203Dca8Ccbf9',
        symbol: 'ETH',
        decimals: 18
      },
      dai: {
        instanceAddress: '0xFe7cfc57147C1f58C88A303068d2f7FC828182a6',
        tokenAddress: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
        symbol: 'DAI',
        decimals: 18
      },
      cdai: {
        instanceAddress:  undefined,
        tokenAddress: '0xe7bc397DBd069fC7d0109C0636d06888bb50668c',
        symbol: 'cDAI',
        decimals: 8
      },
      usdc: {
        instanceAddress:  undefined,
        tokenAddress: '0x75B0622Cec14130172EaE9Cf166B92E5C112FaFF',
        symbol: 'USDC',
        decimals: 6
      },
      cusdc: {
        instanceAddress:  undefined,
        tokenAddress: '0xcfC9bB230F00bFFDB560fCe2428b4E05F3442E35',
        symbol: 'cUSDC',
        decimals: 8
      },
      usdt: {
        instanceAddress:  undefined,
        tokenAddress: '0x03c5F29e9296006876d8DF210BCFfD7EA5Db1Cf1',
        symbol: 'USDT',
        decimals: 6
      }
    }
  }
}
