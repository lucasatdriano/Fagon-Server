import { Injectable, Logger } from '@nestjs/common';
import { ResponseInspectorDto } from '../inspectors/dto/response-inspectors.dto';
import { AgencyResponseDto } from '../agencies/dto/response-agency.dto';

interface DistanceResult {
  distance: number;
  duration: number;
  status: string;
}

export interface ApproximateDistanceResult {
  distance: number;
  method: string;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name?: string;
  importance?: number;
}

interface OSRMRoute {
  routes: {
    distance: number;
    duration: number;
    geometry?: string;
    legs?: unknown[];
  }[];
  waypoints?: unknown[];
  code?: string;
}

function isNominatimResponse(data: unknown): data is NominatimResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'lat' in data &&
    'lon' in data &&
    typeof (data as NominatimResponse).lat === 'string' &&
    typeof (data as NominatimResponse).lon === 'string'
  );
}

function isNominatimResponseArray(data: unknown): data is NominatimResponse[] {
  return Array.isArray(data) && data.every(isNominatimResponse);
}

function isOSRMRoute(data: unknown): data is OSRMRoute {
  return (
    typeof data === 'object' &&
    data !== null &&
    'routes' in data &&
    Array.isArray((data as OSRMRoute).routes) &&
    (data as OSRMRoute).routes.every(
      (route: unknown) =>
        typeof route === 'object' &&
        route !== null &&
        'distance' in route &&
        'duration' in route &&
        typeof (route as { distance: number }).distance === 'number' &&
        typeof (route as { duration: number }).duration === 'number',
    )
  );
}

@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);

  private async geocode(
    address: string,
  ): Promise<{ lat: number; lon: number } | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&limit=1`,
      );

      const data: unknown = await response.json();

      if (!isNominatimResponseArray(data)) {
        this.logger.warn('Resposta do Nominatim em formato inesperado');
        return null;
      }

      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (error) {
      this.logger.error(
        `Erro geocoding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async calculateDistanceOSRM(
    origin: string,
    destination: string,
  ): Promise<DistanceResult> {
    try {
      const originCoords = await this.geocode(origin);
      const destCoords = await this.geocode(destination);

      if (!originCoords || !destCoords) {
        throw new Error('Não foi possível geocodificar os endereços');
      }

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`,
      );

      const data: unknown = await response.json();

      if (!isOSRMRoute(data)) {
        throw new Error('Resposta do OSRM em formato inesperado');
      }

      if (data.routes.length > 0) {
        const result = {
          distance: data.routes[0].distance,
          duration: data.routes[0].duration,
          status: 'OK',
        };

        this.logger.log(
          `Distância OSRM calculada: ${result.distance}m (${(result.distance / 1000).toFixed(1)}km)`,
        );

        return result;
      }

      throw new Error('Rota não encontrada no OSRM');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error(`Erro OSRM: ${errorMessage}`);
      throw error;
    }
  }

  async calculateApproximateDistance(
    agency: AgencyResponseDto,
    inspector: ResponseInspectorDto,
  ): Promise<ApproximateDistanceResult> {
    try {
      if (agency.city === inspector.city && agency.state === inspector.state) {
        this.logger.log(`Mesma cidade: ${agency.city}, ${agency.state}`);

        try {
          const origin = `${agency.street}, ${agency.district}, ${agency.city}, ${agency.state}`;
          const destination = `${inspector.street}, ${inspector.district}, ${inspector.city}, ${inspector.state}`;

          this.logger.log(
            `Calculando distância intramunicipal: ${origin} -> ${destination}`,
          );

          const result = await this.calculateDistanceOSRM(origin, destination);
          return {
            distance: result.distance / 1000,
            method: 'same_city_exact',
          };
        } catch {
          this.logger.warn(
            `Falha no cálculo intramunicipal, usando fallback...`,
          );

          return {
            distance: Math.random() * 5 + 1,
            method: 'same_city_fallback',
          };
        }
      }

      try {
        const origin = `${agency.city}, ${agency.state}, Brasil`;
        const destination = `${inspector.city}, ${inspector.state}, Brasil`;

        this.logger.log(
          `Calculando distância entre cidades: ${origin} -> ${destination}`,
        );

        const result = await this.calculateDistanceOSRM(origin, destination);
        return {
          distance: result.distance / 1000,
          method: 'exact_city',
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido';
        this.logger.warn(
          `Falha no cálculo por cidade, usando fallback estadual...: ${errorMessage}`,
        );

        return this.calculateStateBasedDistance(agency, inspector);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error(
        `Erro inesperado no cálculo aproximado: ${errorMessage}`,
      );

      return {
        distance: 50,
        method: 'emergency_fallback',
      };
    }
  }

  private calculateStateBasedDistance(
    agency: AgencyResponseDto,
    inspector: ResponseInspectorDto,
  ): ApproximateDistanceResult {
    const stateDistances: Record<string, number> = {
      AC: 500,
      AL: 300,
      AM: 800,
      AP: 600,
      BA: 400,
      CE: 350,
      DF: 200,
      ES: 250,
      GO: 300,
      MA: 450,
      MG: 200,
      MS: 400,
      MT: 500,
      PA: 700,
      PB: 320,
      PE: 330,
      PI: 380,
      PR: 250,
      RJ: 150,
      RN: 340,
      RO: 600,
      RR: 900,
      RS: 350,
      SC: 300,
      SE: 310,
      SP: 100,
      TO: 550,
    };

    if (agency.state === inspector.state) {
      const baseDistance = stateDistances[agency.state] || 150;
      const distance = baseDistance * (Math.random() * 0.4 + 0.8);

      this.logger.log(
        `Distância baseada no mesmo estado ${agency.state}: ${distance.toFixed(1)}km`,
      );

      return {
        distance: distance,
        method: 'same_state_fallback',
      };
    }

    const baseDistance1 = stateDistances[agency.state] || 300;
    const baseDistance2 = stateDistances[inspector.state] || 300;
    const averageDistance = (baseDistance1 + baseDistance2) / 2;
    const distance = averageDistance + (Math.random() * 200 - 100);

    this.logger.log(
      `Distância entre estados ${agency.state} e ${inspector.state}: ${distance.toFixed(1)}km`,
    );

    return {
      distance: Math.max(100, distance),
      method: 'different_state_fallback',
    };
  }

  async calculateBatchDistances(
    agencies: AgencyResponseDto[],
    inspectors: ResponseInspectorDto[],
  ): Promise<Map<string, ApproximateDistanceResult[]>> {
    const results = new Map<string, ApproximateDistanceResult[]>();

    for (const agency of agencies) {
      const agencyResults: ApproximateDistanceResult[] = [];

      for (const inspector of inspectors) {
        try {
          const result = await this.calculateApproximateDistance(
            agency,
            inspector,
          );
          agencyResults.push(result);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Erro desconhecido';
          this.logger.error(
            `Erro ao calcular distância para inspector ${inspector.id}: ${errorMessage}`,
          );
          agencyResults.push({ distance: 0, method: 'error' });
        }
      }

      results.set(agency.id, agencyResults);
    }

    return results;
  }
}
