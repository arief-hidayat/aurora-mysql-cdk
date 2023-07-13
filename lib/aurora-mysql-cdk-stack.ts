import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as aas from 'aws-cdk-lib/aws-applicationautoscaling';

interface DBScaling {
  minCapacity: number
  maxCapacity: number
  scalingTarget: number
  predefinedMetric: aas.PredefinedMetric
}
interface DbParam {
  key: string
  value: string
}
// selected fields from rds.DatabaseProxyProps
interface RdsProxyProps {
  debugLogging: boolean
}
interface AuroraMysqlCdkStackProps extends cdk.StackProps {
  vpcName: string
  vpcSubnets: ec2.SubnetSelection

  auroraVersion: rds.AuroraMysqlEngineVersion
  defaultDatabaseName: string
  dbPort: number
  dbParams: DbParam[]
  allowInboundFrom: ec2.IPeer[]
  dbInstances: number
  dbInstanceType: ec2.InstanceType
  dbScaling?: DBScaling
  backup?: rds.BackupProps,
  rdsProxy?: RdsProxyProps
}
export class AuroraMysqlCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuroraMysqlCdkStackProps) {
    super(scope, id, props);
    const vpc = ec2.Vpc.fromLookup(this, 'dev-vpc', {vpcName: props.vpcName});

    // security group
    const dbSecurityGroup = new ec2.SecurityGroup(this, "db-sg", {
      vpc: vpc,
      allowAllOutbound: false,
      description: "Security Group For the RDS Aurora Cluster.",
    });
    for(let peer of props.allowInboundFrom) {
      dbSecurityGroup.addIngressRule(peer, ec2.Port.tcp(props.dbPort))
    }

    // db param group
    const dbEngine = rds.DatabaseClusterEngine.auroraMysql({
      version: props.auroraVersion,
    });
    const dbParamGrp = new rds.ParameterGroup(this, 'param-grp', {
      engine: dbEngine
    });
    for(let param of props.dbParams) {
      dbParamGrp.addParameter(param.key, param.value)
    }

    const dbCreds = rds.Credentials.fromGeneratedSecret('aurora');
    // aurora cluster
    const auroraCluster = new rds.DatabaseCluster(this, "db", {
      engine: dbEngine,
      credentials: dbCreds,
      instanceProps: {
        vpcSubnets: props.vpcSubnets,
        securityGroups: [dbSecurityGroup],
        vpc: vpc,
        instanceType: props.dbInstanceType,
        enablePerformanceInsights: true,
      },
      backup: props.backup,
      port: props.dbPort,
      defaultDatabaseName: props.defaultDatabaseName,
      instances: props.dbInstances,
      instanceUpdateBehaviour: rds.InstanceUpdateBehaviour.ROLLING,
      deletionProtection: false,
      parameterGroup: dbParamGrp
    });

    // autoscaling
    if (props.dbScaling) {
      const readCapacity = new aas.ScalableTarget(
        this,
        'rds-scaling',
        {
          serviceNamespace: aas.ServiceNamespace.RDS,
          minCapacity: props.dbScaling.minCapacity,
          maxCapacity: props.dbScaling.maxCapacity,
          resourceId: 'cluster:'+auroraCluster.clusterIdentifier,
          scalableDimension: 'rds:cluster:ReadReplicaCount',
        }
      );
      readCapacity.scaleToTrackMetric(
        'rdsScalingTracking',
        {
          targetValue: props.dbScaling.scalingTarget,
          predefinedMetric: props.dbScaling.predefinedMetric,
        }
      );
    }

    new cdk.CfnOutput(this, `cluster-endpoint`, {
      value: auroraCluster.clusterEndpoint.hostname,
      description: `Cluster endpoint`,
    });
    new cdk.CfnOutput(this, `cluster-reader-endpoint`, {
      value: auroraCluster.clusterReadEndpoint.hostname,
      description: `Cluster reader endpoint`,
    });
    new cdk.CfnOutput(this, `db-creds-secret`, {
      value: dbCreds.secretName || '',
      description: `DB creds secret name`,
    });
    // if(props.rdsProxy) {
    //   const proxy = auroraCluster.addProxy("aurora-proxy", {
    //     debugLogging: props.rdsProxy.debugLogging,
    //     secrets: [dbCreds.secret!!],
    //     vpc,
    //     securityGroups: [dbSecurityGroup],
    //   });
    // }
  }
  //TODO: serverless https://www.codewithyou.com/blog/aurora-serverless-v2-with-aws-cdk
  // https://aws.plainenglish.io/set-up-aurora-serverless-and-rds-proxy-with-aws-cdk-ff1a1b216c65
}
