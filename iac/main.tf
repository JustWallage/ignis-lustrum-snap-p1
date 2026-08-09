terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Bucket, endpoint and credentials are passed at `terraform init` time from
  # .env / GitHub Actions. This reuses the shared R2 state bucket (TF_STATE_BUCKET).
  backend "s3" {
    key                         = "ignis-snaps/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Production metadata. Image bytes live in the bucket below. The Worker and its
# custom domain (snaps.justwallage.nl) are owned by Wrangler/CI, not Terraform —
# this only provisions the stateful backing stores.
resource "cloudflare_d1_database" "prod" {
  account_id = var.cloudflare_account_id
  name       = "ignis-snaps-prod"
  read_replication = {
    mode = "disabled"
  }
}

# Snap and sprite bytes. Addressed by NAME, so nothing is substituted into
# wrangler.jsonc from an output here the way the D1 id is — the two names are the
# same literal, exactly as `database_name` already is. Ephemeral E2E does NOT use
# this bucket and does not come through Terraform: ephemeral-e2e.yml creates its
# own shared one on demand, so a branch pipeline never waits on a prod apply.
resource "cloudflare_r2_bucket" "images_prod" {
  account_id = var.cloudflare_account_id
  name       = "ignis-snaps-images-prod"
  location   = "WEUR"
}
