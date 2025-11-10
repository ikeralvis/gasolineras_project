export interface Gasolinera {
  IDEESS: string;
  rotulo: string;
  municipio: string;
  provincia: string;
  direccion: string;
  gasolina95: number | null;
  gasoleoA: number | null;
  lat: number;
  lng: number;
}
