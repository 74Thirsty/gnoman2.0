const { ethers } = require('ethers');

async function test() {
  console.log('Testing Wallet.createRandom()...');
  
  const wallet = ethers.Wallet.createRandom();
  console.log('Wallet type:', wallet.constructor.name);
  console.log('Has mnemonic?', !!wallet.mnemonic);
  if (wallet.mnemonic) {
      console.log('Mnemonic phrase:', wallet.mnemonic.phrase);
  } else {
      console.log('No mnemonic found');
  }
}

test();
