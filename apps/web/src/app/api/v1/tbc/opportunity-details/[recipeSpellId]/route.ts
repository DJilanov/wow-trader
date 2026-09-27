import { TBC_CLIENT_PRODUCT } from "../../../../../../lib/game-versions";
import {
  handleOpportunityDetailsRequest,
  type OpportunityDetailsRouteContext,
} from "../../../../../../lib/opportunity-details-route";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: OpportunityDetailsRouteContext): Promise<Response> {
  return handleOpportunityDetailsRequest(request, context, TBC_CLIENT_PRODUCT);
}
