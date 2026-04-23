package solana

import (
	"crypto/sha256"
	"encoding/binary"

	solanago "github.com/gagliardetto/solana-go"
)

// anchorDiscriminator computes the 8-byte Anchor instruction discriminator.
// It is the first 8 bytes of SHA256("global:<instruction_name>").
func anchorDiscriminator(name string) [8]byte {
	hash := sha256.Sum256([]byte("global:" + name))
	var disc [8]byte
	copy(disc[:], hash[:8])
	return disc
}

// borshString encodes a string as Borsh: 4-byte LE length prefix + UTF-8 bytes.
func borshString(s string) []byte {
	buf := make([]byte, 4+len(s))
	binary.LittleEndian.PutUint32(buf[:4], uint32(len(s)))
	copy(buf[4:], s)
	return buf
}

// borshU64 encodes a uint64 as 8-byte little-endian.
func borshU64(v uint64) []byte {
	buf := make([]byte, 8)
	binary.LittleEndian.PutUint64(buf, v)
	return buf
}

// borshPubkey encodes a public key as 32 bytes (already in correct format).
func borshPubkey(pk solanago.PublicKey) []byte {
	return pk[:]
}

// borshVecString encodes a Vec<String> as Borsh: 4-byte LE count + each string Borsh-encoded.
func borshVecString(strs []string) []byte {
	buf := make([]byte, 4)
	binary.LittleEndian.PutUint32(buf, uint32(len(strs)))
	for _, s := range strs {
		buf = append(buf, borshString(s)...)
	}
	return buf
}

// InitializeFleetVault builds the initialize_fleet_vault instruction.
func InitializeFleetVault(
	programID solanago.PublicKey,
	fleetVault solanago.PublicKey,
	authority solanago.PublicKey,
	fleetID string,
	treasuryDWalletID string,
	coSigner solanago.PublicKey,
	dailyCap uint64,
) solanago.Instruction {
	disc := anchorDiscriminator("initialize_fleet_vault")

	var data []byte
	data = append(data, disc[:]...)
	data = append(data, borshString(fleetID)...)
	data = append(data, borshString(treasuryDWalletID)...)
	data = append(data, borshPubkey(coSigner)...)
	data = append(data, borshU64(dailyCap)...)

	return solanago.NewInstruction(
		programID,
		solanago.AccountMetaSlice{
			solanago.Meta(fleetVault).WRITE(),
			solanago.Meta(authority).WRITE().SIGNER(),
			solanago.Meta(solanago.SystemProgramID),
		},
		data,
	)
}

// RegisterAgentWallet builds the register_agent_wallet instruction.
func RegisterAgentWallet(
	programID solanago.PublicKey,
	fleetVault solanago.PublicKey,
	agentWallet solanago.PublicKey,
	authority solanago.PublicKey,
	fleetID string,
	agentKey string,
	dwalletID string,
	maxPerTx uint64,
	dailyLimit uint64,
	allowedChains []string,
) solanago.Instruction {
	disc := anchorDiscriminator("register_agent_wallet")

	var data []byte
	data = append(data, disc[:]...)
	data = append(data, borshString(fleetID)...)
	data = append(data, borshString(agentKey)...)
	data = append(data, borshString(dwalletID)...)
	data = append(data, borshU64(maxPerTx)...)
	data = append(data, borshU64(dailyLimit)...)
	data = append(data, borshVecString(allowedChains)...)

	return solanago.NewInstruction(
		programID,
		solanago.AccountMetaSlice{
			solanago.Meta(fleetVault),
			solanago.Meta(agentWallet).WRITE(),
			solanago.Meta(authority).WRITE().SIGNER(),
			solanago.Meta(solanago.SystemProgramID),
		},
		data,
	)
}

// ApproveSigning builds the approve_signing instruction.
func ApproveSigning(
	programID solanago.PublicKey,
	agentWallet solanago.PublicKey,
	fleetVault solanago.PublicKey,
	signingApproval solanago.PublicKey,
	coSigner solanago.PublicKey,
	targetChain string,
	targetAddress string,
	amount uint64,
	nonce string,
) solanago.Instruction {
	disc := anchorDiscriminator("approve_signing")

	var data []byte
	data = append(data, disc[:]...)
	data = append(data, borshString(targetChain)...)
	data = append(data, borshString(targetAddress)...)
	data = append(data, borshU64(amount)...)
	data = append(data, borshString(nonce)...)

	return solanago.NewInstruction(
		programID,
		solanago.AccountMetaSlice{
			solanago.Meta(agentWallet).WRITE(),
			solanago.Meta(fleetVault),
			solanago.Meta(signingApproval).WRITE(),
			solanago.Meta(coSigner).WRITE().SIGNER(),
			solanago.Meta(solanago.SystemProgramID),
		},
		data,
	)
}

// FreezeAgent builds the freeze_agent instruction.
func FreezeAgent(
	programID solanago.PublicKey,
	fleetVault solanago.PublicKey,
	agentWallet solanago.PublicKey,
	authority solanago.PublicKey,
	fleetID string,
	agentKey string,
) solanago.Instruction {
	disc := anchorDiscriminator("freeze_agent")

	var data []byte
	data = append(data, disc[:]...)
	data = append(data, borshString(fleetID)...)
	data = append(data, borshString(agentKey)...)

	return solanago.NewInstruction(
		programID,
		solanago.AccountMetaSlice{
			solanago.Meta(fleetVault),
			solanago.Meta(agentWallet).WRITE(),
			solanago.Meta(authority).SIGNER(),
		},
		data,
	)
}
