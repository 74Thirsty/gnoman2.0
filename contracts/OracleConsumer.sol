// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OracleConsumer {
    uint256 public data;

    event Requested(bytes32 requestId, string jobId, string url, string path);
    event Fulfilled(bytes32 requestId, uint256 value);

    function requestData(string memory jobId, string memory url, string memory path) external returns (bytes32) {
        bytes32 requestId = keccak256(abi.encodePacked(block.timestamp, msg.sender, jobId, url, path));
        emit Requested(requestId, jobId, url, path);
        return requestId;
    }

    function fulfill(bytes32 requestId, uint256 value) external {
        data = value;
        emit Fulfilled(requestId, value);
    }
}
