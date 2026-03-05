import {
  resolveFeatureFlagBoolean,
  resolveFeatureFlagEnvName,
} from "./featureFlagResolver.service";

describe("featureFlagResolver", () => {
  test("maps NODE_ENV values to supported feature flag envs", () => {
    expect(resolveFeatureFlagEnvName("production")).toBe("production");
    expect(resolveFeatureFlagEnvName("staging")).toBe("staging");
    expect(resolveFeatureFlagEnvName("development")).toBe("dev");
    expect(resolveFeatureFlagEnvName("test")).toBe("dev");
    expect(resolveFeatureFlagEnvName("anything-else")).toBe("local");
  });

  test("reads boolean defaults from flags[].defaultByEnv", () => {
    const enabled = resolveFeatureFlagBoolean({
      bank: {
        flags: [
          {
            id: "ff.enable_multi_provider",
            defaultByEnv: {
              production: true,
              dev: false,
            },
          },
        ],
      },
      flagId: "ff.enable_multi_provider",
      env: "production",
      fallback: false,
    });
    expect(enabled).toBe(true);
  });

  test("supports legacy key/enabled entries", () => {
    const enabled = resolveFeatureFlagBoolean({
      bank: {
        flags: [{ key: "legacy.flag", enabled: true }],
      },
      flagId: "legacy.flag",
      env: "local",
      fallback: false,
    });
    expect(enabled).toBe(true);
  });

  test("applies runtime override only when allowlisted", () => {
    const bank = {
      config: {
        runtimeOverrides: {
          enabled: true,
          allowList: ["ff.enable_multi_provider"],
        },
      },
      flags: [
        {
          id: "ff.enable_multi_provider",
          defaultByEnv: { production: true },
        },
      ],
    };

    const enabled = resolveFeatureFlagBoolean({
      bank,
      flagId: "ff.enable_multi_provider",
      env: "production",
      runtimeOverrides: { "ff.enable_multi_provider": false },
      fallback: true,
    });
    expect(enabled).toBe(false);
  });
});

