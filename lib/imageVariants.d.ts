export interface VariantSpec {
    dir: "sm" | "md" | "lg"
    width: number | null
    quality: number
}

export interface VariantResult {
    variant: "sm" | "md" | "lg"
    path: string
    bytes: number
    skipped: boolean
}

export interface GenerateVariantsOptions {
    force?: boolean
}

export declare const VARIANTS: readonly VariantSpec[]

export declare const VARIANT_DIR_NAMES: ReadonlySet<string>

export declare function generateImageVariants(
    input: Buffer | string,
    destBaseDir: string,
    filename: string,
    options?: GenerateVariantsOptions
): Promise<VariantResult[]>

export declare function isVariantDir(dirName: string): boolean
