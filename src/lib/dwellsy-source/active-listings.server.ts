import "server-only";
import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";

export const CLEVELAND_MSA_CODE = "17460";

export type DwellsyActiveListing = {
  sourceListingId: string;
  sourcePropertyId: string;
  sourceParentPropertyId: string | null;
  sourceCompanyId: string | null;
  operatorNameSlug: string | null;
  communityId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  askingRent: number;
  squareFeet: number | null;
  bedrooms: number;
  bathrooms: number | null;
  propertyType: "apartment" | "house";
  listingCreatedAt: Date;
  sourceUpdatedAt: Date | null;
};

type SourceRow = {
  source_listing_id: string;
  source_property_id: string;
  source_parent_property_id: string | null;
  source_company_id: string | null;
  operator_name_slug: string | null;
  community_id: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  asking_rent: string | number;
  square_feet: string | number | null;
  bedrooms: string | number;
  full_baths: string | number | null;
  half_baths: string | number | null;
  property_type: "Apartment" | "House";
  listing_created_at: Date | string;
  source_updated_at: Date | string | null;
};

const ACTIVE_LISTINGS_SQL = `
  SELECT listing_id::text AS source_listing_id,
         property_id::text AS source_property_id,
         parent_property_id::text AS source_parent_property_id,
         company_id::text AS source_company_id,
         company_name_slug AS operator_name_slug,
         community_id::text AS community_id,
         address_1,
         address_2,
         address_city AS city,
         address_state AS state,
         address_zip AS postal_code,
         latitude,
         longitude,
         listing_amount AS asking_rent,
         square_feet,
         bedrooms,
         full_baths,
         half_baths,
         property_category AS property_type,
         listing_create_time AS listing_created_at,
         last_update_time AS source_updated_at
  FROM dwellsy_prod.active_listing_table
  WHERE msa_code = $1::bigint
    AND active_listing_status = 'active'
    AND record_status = 'active'
    AND property_category IN ('Apartment', 'House')
    AND COALESCE(room_for_rent_flag, false) = false
    AND listing_amount > 0
    AND bedrooms IS NOT NULL
  ORDER BY listing_id
`;

function optionalNumber(value: string | number | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function joinedAddress(address1: string | null, address2: string | null) {
  const parts = [address1, address2].filter((value): value is string => Boolean(value?.trim()));
  return parts.length ? parts.join(" ") : null;
}

export async function loadClevelandActiveListings(): Promise<{
  listings: DwellsyActiveListing[];
  sourceAvailableThrough: Date;
}> {
  return withDwellsyReadOnly(async (client) => {
    const result = await client.query<SourceRow>(ACTIVE_LISTINGS_SQL, [CLEVELAND_MSA_CODE]);
    const listings = result.rows.map((row): DwellsyActiveListing => {
      const askingRent = Number(row.asking_rent);
      const bedrooms = Number(row.bedrooms);
      const fullBaths = optionalNumber(row.full_baths);
      const halfBaths = optionalNumber(row.half_baths);
      return {
        sourceListingId: row.source_listing_id,
        sourcePropertyId: row.source_property_id,
        sourceParentPropertyId: row.source_parent_property_id,
        sourceCompanyId: row.source_company_id,
        operatorNameSlug: row.operator_name_slug,
        communityId: row.community_id,
        address: joinedAddress(row.address_1, row.address_2),
        city: row.city,
        state: row.state,
        postalCode: row.postal_code,
        latitude: optionalNumber(row.latitude),
        longitude: optionalNumber(row.longitude),
        askingRent,
        squareFeet: optionalNumber(row.square_feet),
        bedrooms,
        bathrooms: fullBaths === null && halfBaths === null
          ? null
          : (fullBaths ?? 0) + (halfBaths ?? 0) * 0.5,
        propertyType: row.property_type.toLowerCase() as "apartment" | "house",
        listingCreatedAt: new Date(row.listing_created_at),
        sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at) : null,
      };
    });
    const sourceAvailableThrough = listings.reduce(
      (latest, listing) => listing.sourceUpdatedAt && listing.sourceUpdatedAt > latest
        ? listing.sourceUpdatedAt
        : latest,
      new Date(0)
    );
    if (sourceAvailableThrough.getTime() === 0) {
      throw new Error("Dwellsy returned listings without a usable source timestamp.");
    }
    return { listings, sourceAvailableThrough };
  });
}
