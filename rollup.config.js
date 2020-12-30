import commonjs from "@rollup/plugin-commonjs"
import resolve from "@rollup/plugin-node-resolve"
import peerDepsExternal from "rollup-plugin-peer-deps-external"
import typescript from "rollup-plugin-typescript2"

export default {
  input: "./src/index.ts",
  output: {
    format: "cjs",
    dir: "dist/",
    exports: "named",
    sourcemap: true,
    strict: true,
  },
  plugins: [
    commonjs(),
    peerDepsExternal(),
    resolve({
      preferBuiltins: true,
    }),
    typescript(),
  ],
  external: ["ethers"],
}
