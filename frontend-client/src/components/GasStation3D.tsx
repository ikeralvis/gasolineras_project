import { useEffect, useRef } from 'react';

interface GasStation3DProps {
  className?: string;
}

export default function GasStation3D({ className = '' }: GasStation3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sceneRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let THREE: any;
    let camera: any, scene: any, renderer: any;
    let stationGroup: any, snow: any;
    let mouseX = 0, mouseY = 0;
    const clock = { startTime: Date.now(), getElapsedTime: () => (Date.now() - clock.startTime) / 1000 };

    const init = async () => {
      // Importar Three.js dinámicamente
      THREE = await import('three');
      
      if (!canvasRef.current) return;

      // Colores optimizados
      const colors = {
        bg: 0xE8EAFE,
        primary: 0x000C74,
        accent: 0x6A75FF,
        white: 0xffffff,
        dark: 0x0A0F3D
      };

      // Escena
      scene = new THREE.Scene();
      scene.background = new THREE.Color(colors.bg);
      scene.fog = new THREE.Fog(colors.bg, 15, 40);
      sceneRef.current = scene;

      // Cámara - posicionada más a la izquierda
      const aspect = window.innerWidth / window.innerHeight;
      camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
      camera.position.set(-5, 8, 25); // Movida hacia la izquierda (x negativo)
      camera.lookAt(-3, 2, 0); // Mirando también un poco a la izquierda

      // Renderer
      renderer = new THREE.WebGLRenderer({ 
        canvas: canvasRef.current,
        antialias: false, // Desactivar para mejor rendimiento
        alpha: false, // Cambiar a false para fondo opaco
        powerPreference: "high-performance"
      });
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height, true);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limitar para rendimiento
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap; // Más rápido que PCFSoft

      // Luces (optimizadas)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(8, 15, 8);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024; // Reducido de 2048
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 50;
      scene.add(dirLight);

      // Materiales compartidos
      const matPrimary = new THREE.MeshStandardMaterial({ 
        color: colors.primary, 
        flatShading: true,
        roughness: 0.8,
        metalness: 0.2
      });
      const matAccent = new THREE.MeshStandardMaterial({ 
        color: colors.accent, 
        flatShading: true,
        roughness: 0.7
      });
      const matWhite = new THREE.MeshStandardMaterial({ 
        color: colors.white, 
        flatShading: true 
      });
      const matDark = new THREE.MeshStandardMaterial({ 
        color: colors.dark, 
        flatShading: true 
      });

      // Suelo
      const groundGeo = new THREE.CircleGeometry(40, 32);
      const groundMat = new THREE.MeshStandardMaterial({ color: colors.white });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Gasolinera
      stationGroup = new THREE.Group();
      
      // Techo
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.4, 6),
        matWhite
      );
      roof.position.y = 4;
      roof.castShadow = true;
      stationGroup.add(roof);

      const roofStripe = new THREE.Mesh(
        new THREE.BoxGeometry(10.2, 0.15, 6.2),
        matPrimary
      );
      roofStripe.position.y = 4;
      stationGroup.add(roofStripe);

      // Columnas
      const colGeo = new THREE.CylinderGeometry(0.25, 0.25, 4, 6);
      const col1 = new THREE.Mesh(colGeo, matDark);
      col1.position.set(-3.5, 2, 0);
      col1.castShadow = true;
      
      const col2 = new THREE.Mesh(colGeo, matDark);
      col2.position.set(3.5, 2, 0);
      col2.castShadow = true;
      
      stationGroup.add(col1, col2);

      // Surtidores (simplificados)
      const createPump = (x: number) => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.5, 0.5),
          matAccent
        );
        base.position.y = 0.75;
        base.castShadow = true;
        
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.3, 0.52),
          matDark
        );
        screen.position.y = 1.2;
        
        group.add(base, screen);
        group.position.x = x;
        return group;
      };

      stationGroup.add(createPump(-2), createPump(0), createPump(2));

      // Isla
      const island = new THREE.Mesh(
        new THREE.BoxGeometry(7, 0.15, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee })
      );
      island.position.y = 0.08;
      stationGroup.add(island);

      scene.add(stationGroup);

      // Tienda (simplificada)
      const store = new THREE.Group();
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(8, 3, 4),
        matWhite
      );
      building.position.y = 1.5;
      building.castShadow = true;
      
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.6, 0.15),
        matPrimary
      );
      sign.position.set(0, 3.5, 2);
      
      store.add(building, sign);
      store.position.z = -6;
      scene.add(store);

      // Árboles decorativos (reducidos)
      const createTree = (x: number, z: number, scale = 1) => {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 0.8 * scale, 4),
          matDark
        );
        trunk.position.y = 0.4 * scale;
        trunk.castShadow = true;
        
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(1 * scale, 2 * scale, 5),
          matPrimary
        );
        leaves.position.y = 1.5 * scale;
        leaves.castShadow = true;
        
        group.add(trunk, leaves);
        group.position.set(x, 0, z);
        return group;
      };

      scene.add(createTree(-8, -4, 1), createTree(8, -5, 1.2));

      // Partículas de nieve (reducidas)
      const snowCount = 500; // Reducido de 1500
      const snowGeometry = new THREE.BufferGeometry();
      const snowPositions = new Float32Array(snowCount * 3);
      
      for (let i = 0; i < snowCount * 3; i += 3) {
        snowPositions[i] = (Math.random() - 0.5) * 60;
        snowPositions[i + 1] = Math.random() * 30;
        snowPositions[i + 2] = (Math.random() - 0.5) * 60;
      }
      
      snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));

      snow = new THREE.Points(snowGeometry, new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.3,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
      }));
      scene.add(snow);

      // Mouse tracking
      const onMouseMove = (event: MouseEvent) => {
        mouseX = (event.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (event.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('mousemove', onMouseMove);

      // Resize
      const onResize = () => {
        if (!camera || !renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
      };
      window.addEventListener('resize', onResize);

      // Animación
      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);
        
        const time = clock.getElapsedTime();

        // Parallax suave - ajustado para mantener la vista a la izquierda
        const targetX = -5 + mouseX * 2;
        const targetY = 8 - mouseY * 1.5;
        camera.position.x += (targetX - camera.position.x) * 0.03;
        camera.position.y += (targetY - camera.position.y) * 0.03;
        camera.lookAt(-3, 2, 0);

        // Nieve
        if (snow) {
          const positions = snow.geometry.attributes.position.array;
          for (let i = 1; i < positions.length; i += 3) {
            positions[i] -= 0.08;
            if (positions[i] < 0) {
              positions[i] = 30;
              positions[i - 1] = (Math.random() - 0.5) * 60;
              positions[i + 1] = (Math.random() - 0.5) * 60;
            }
          }
          snow.geometry.attributes.position.needsUpdate = true;
        }

        // Rotación sutil de árboles
        scene.traverse((object: any) => {
          if (object.geometry?.type === 'ConeGeometry') {
            object.rotation.y = Math.sin(time * 0.4) * 0.04;
          }
        });

        renderer.render(scene, camera);
      };

      animate();

      // Cleanup
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (renderer) {
          renderer.dispose();
        }
        if (scene) {
          scene.traverse((object: any) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((mat: any) => mat.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }
      };
    };

    init();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`fixed inset-0 ${className}`} style={{ zIndex: 0, width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
