/**
 * The first Market IQ history cohort. These 25 markets are monitored before
 * every one has a customer-facing report adapter, so their daily supply
 * history is already available when a market launches.
 */
export const MARKET_IQ_TRACKED_MARKETS = [
  { id: "chattanooga-tn", cbsaCode: "16860", name: "Chattanooga", state: "TN" },
  { id: "jacksonville-fl", cbsaCode: "27260", name: "Jacksonville", state: "FL" },
  { id: "nashville-davidson-murfreesboro-franklin-tn", cbsaCode: "34980", name: "Nashville", state: "TN" },
  { id: "memphis-tn-ms-ar", cbsaCode: "32820", name: "Memphis", state: "TN" },
  { id: "knoxville-tn", cbsaCode: "28940", name: "Knoxville", state: "TN" },
  { id: "clarksville-tn-ky", cbsaCode: "17300", name: "Clarksville", state: "TN" },
  { id: "phoenix-az", cbsaCode: "38060", name: "Phoenix", state: "AZ" },
  { id: "birmingham-al", cbsaCode: "13820", name: "Birmingham", state: "AL" },
  { id: "huntsville-al", cbsaCode: "26620", name: "Huntsville", state: "AL" },
  { id: "montgomery-al", cbsaCode: "33860", name: "Montgomery", state: "AL" },
  { id: "seattle-wa", cbsaCode: "42660", name: "Seattle", state: "WA" },
  { id: "denver-co", cbsaCode: "19740", name: "Denver", state: "CO" },
  { id: "san-antonio-tx", cbsaCode: "41700", name: "San Antonio", state: "TX" },
  { id: "boulder-co", cbsaCode: "14500", name: "Boulder", state: "CO" },
  { id: "fort-collins-co", cbsaCode: "22660", name: "Fort Collins", state: "CO" },
  { id: "dallas-fort-worth-arlington-tx", cbsaCode: "19100", name: "Dallas-Fort Worth", state: "TX" },
  { id: "baltimore-towson-md", cbsaCode: "12580", name: "Baltimore", state: "MD" },
  { id: "cincinnati-middletown-oh-ky-in", cbsaCode: "17140", name: "Cincinnati", state: "OH" },
  { id: "pittsburgh-pa", cbsaCode: "38300", name: "Pittsburgh", state: "PA" },
  { id: "chicago-joliet-naperville-il-in-wi", cbsaCode: "16980", name: "Chicago", state: "IL" },
  { id: "cleveland-elyria-mentor-oh", cbsaCode: "17460", name: "Cleveland", state: "OH" },
  { id: "columbus-oh", cbsaCode: "18140", name: "Columbus", state: "OH" },
  { id: "detroit-warren-livonia-mi", cbsaCode: "19820", name: "Detroit", state: "MI" },
  { id: "indianapolis-carmel-in", cbsaCode: "26900", name: "Indianapolis", state: "IN" },
  { id: "fort-wayne-in", cbsaCode: "23060", name: "Fort Wayne", state: "IN" },
] as const;

export const MARKET_IQ_TRACKED_CBSA_CODES = MARKET_IQ_TRACKED_MARKETS.map((market) => market.cbsaCode);

