const { ethers } = require('ethers');

async function test() {
  const entropy = ethers.randomBytes(16);
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
  
  console.log('Testing fromMnemonic signature...');
  
  try {
    const walletDefault = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    console.log('Default path:', walletDefault.path);
    console.log('Default address:', walletDefault.address);

    const customPath = "m/44'/60'/0'/0/1";
    // Check if second argument is path
    const walletCustom = ethers.HDNodeWallet.fromMnemonic(mnemonic, customPath);
    console.log('Custom path:', walletCustom.path);
    console.log('Custom address:', walletCustom.address);

    if (walletCustom.path === customPath && walletCustom.address !== walletDefault.address) {
        console.log('SUCCESS: fromMnemonic accepts path as second argument');
    } else {
        console.log('FAILURE: fromMnemonic did not use custom path correctly');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

test();
