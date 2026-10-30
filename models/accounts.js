// accounts.js
const accounts = {};

function getAccount(accountId) {
  return accounts[accountId] || null;
}

module.exports = { accounts, getAccount };
