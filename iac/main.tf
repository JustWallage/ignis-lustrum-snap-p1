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

# Production database (metadata AND image bytes — this app is D1-only; the CI
# API token has no R2 permissions). The Worker and its custom domain
# (snaps.justwallage.nl) are owned by Wrangler/CI, not Terraform — this only
# provisions the stateful backing store.
resource "cloudflare_d1_database" "prod" {
  account_id = var.cloudflare_account_id
  name       = "ignis-snaps-prod"
  read_replication = {
    mode = "disabled"
  }
}
