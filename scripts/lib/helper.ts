export const argumentError = (argName: string) => {
  throw new Error(
    `Must pass the env var ${argName}\nYou can pass arguments using ${argName}=0xdeadbeef SECOND_ARG=0xbeefdead npx hardhat run scripts/your_script.ts`,
  )
}
